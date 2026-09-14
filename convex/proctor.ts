/**
 * The screen-share proctoring session: starting one, keeping it alive, and
 * handing over what was recorded.
 *
 * Everything here is called by the `/proctor/` page in the viewer's own
 * browser. None of it can be trusted to be honest about the browser it runs in,
 * which is why the one thing that matters — that a whole screen is being
 * captured and still is — rests on a heartbeat that stops the moment the stream
 * does, rather than on anything the page claims once at the start.
 */

import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, type QueryCtx, query } from "./_generated/server";
import { optionalViewer, requireViewer } from "./lib/auth";
import { forbidden, invalid } from "./lib/errors";
import { activeProctorSession, PROCTOR_LIVE_WINDOW_MS, PROCTOR_REQUIRED_SURFACE } from "./lib/proctor";
import { viewerContext } from "./submissions";

export type ProctorState = {
  active: boolean;
  sessionId: Id<"proctorSessions"> | null;
  startedAt: number | null;
  /** Milliseconds until the session lapses if the next heartbeat never lands. */
  expiresIn: number | null;
};

/** What the `/proctor/` page shows, and what the site shell asks about. */
export const state = query({
  args: {},
  handler: async (ctx): Promise<ProctorState> => {
    const profile = await optionalViewer(ctx);
    if (!profile) return { active: false, sessionId: null, startedAt: null, expiresIn: null };

    const session = await activeProctorSession(ctx, profile._id);
    if (!session) return { active: false, sessionId: null, startedAt: null, expiresIn: null };
    return {
      active: true,
      sessionId: session._id,
      startedAt: session.startedAt,
      expiresIn: session.lastSeenAt + PROCTOR_LIVE_WINDOW_MS - Date.now(),
    };
  },
});

export type ProctorGate = {
  /** The viewer is in a contest that wants a screen share they are not giving. */
  blocked: boolean;
  contestKey: string | null;
  contestName: string | null;
};

/**
 * What the page render asks: should this viewer be seeing the site at all?
 *
 * A plain query, because being proctored is state the session already carries;
 * nothing about the request itself has to be inspected.
 */
export const gate = query({
  args: {},
  handler: async (ctx): Promise<ProctorGate> => {
    const shut: ProctorGate = { blocked: false, contestKey: null, contestName: null };
    const profile = await optionalViewer(ctx);
    if (!profile?.currentParticipationId) return shut;

    const participation = await ctx.db.get(profile.currentParticipationId);
    if (!participation) return shut;
    const contest = await ctx.db.get(participation.contestId);
    if (!contest?.proctorRequired) return shut;

    return {
      blocked: !(await activeProctorSession(ctx, profile._id)),
      contestKey: contest.key,
      contestName: contest.name,
    };
  },
});

/**
 * Begin a session, retiring any earlier one.
 *
 * Two tabs sharing at once would leave the older one heartbeating an unwatched
 * stream, so the newer always wins and the older is closed with a reason the
 * admin can see. That is also what makes "open it again" a recovery rather than
 * an error.
 */
export const start = mutation({
  args: { displaySurface: v.string(), userAgent: v.string() },
  handler: async (ctx, args): Promise<{ sessionId: Id<"proctorSessions"> }> => {
    const profile = await requireViewer(ctx);

    if (args.displaySurface !== PROCTOR_REQUIRED_SURFACE) {
      throw invalid("Share your entire screen, not a window or a tab.");
    }

    const now = Date.now();
    const previous = await ctx.db
      .query("proctorSessions")
      .withIndex("by_profile_started", (q) => q.eq("profileId", profile._id))
      .order("desc")
      .first();
    if (previous && previous.endedAt === undefined) {
      await ctx.db.patch(previous._id, { endedAt: now, endedReason: "replaced" });
    }

    const viewer = await viewerContext(ctx);
    const sessionId = await ctx.db.insert("proctorSessions", {
      profileId: profile._id,
      startedAt: now,
      lastSeenAt: now,
      displaySurface: args.displaySurface,
      userAgent: args.userAgent.slice(0, 512),
      ...(viewer.contest ? { contestId: viewer.contest._id } : {}),
    });
    return { sessionId };
  },
});

/** Keep it live. Silence is what ends a session, so this is the whole contract. */
export const heartbeat = mutation({
  args: { sessionId: v.id("proctorSessions") },
  handler: async (ctx, args): Promise<{ ok: boolean }> => {
    const profile = await requireViewer(ctx);
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.profileId !== profile._id) throw forbidden();
    // A session that was replaced stays ended: the newer tab owns the stream.
    if (session.endedAt !== undefined) return { ok: false };

    await ctx.db.patch(session._id, { lastSeenAt: Date.now() });
    return { ok: true };
  },
});

export const stop = mutation({
  args: { sessionId: v.id("proctorSessions"), reason: v.optional(v.string()) },
  handler: async (ctx, args): Promise<null> => {
    const profile = await requireViewer(ctx);
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.profileId !== profile._id) throw forbidden();
    if (session.endedAt === undefined) {
      await ctx.db.patch(session._id, {
        endedAt: Date.now(),
        endedReason: args.reason?.slice(0, 100) ?? "stopped",
      });
    }
    return null;
  },
});

/* -------------------------------------------------------------------------- */
/* Recording                                                                  */
/* -------------------------------------------------------------------------- */

export const uploadUrl = mutation({
  args: {},
  handler: async (ctx): Promise<string> => {
    await requireViewer(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Record a slice that has already been uploaded.
 *
 * The index is the recorder's own counter, so a missing number is a slice that
 * never arrived — a dropped upload rather than a person who stopped sharing,
 * and worth telling apart on the timeline.
 */
export const addChunk = mutation({
  args: {
    sessionId: v.id("proctorSessions"),
    storageId: v.id("_storage"),
    index: v.number(),
    startedAt: v.number(),
    durationMs: v.number(),
    bytes: v.number(),
    mimeType: v.string(),
  },
  handler: async (ctx, args): Promise<null> => {
    const profile = await requireViewer(ctx);
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.profileId !== profile._id) throw forbidden();

    // Which contest they are in is read here rather than taken from the page,
    // because it changes during a session and the server is the only side that
    // knows it honestly.
    const participation = profile.currentParticipationId
      ? await ctx.db.get(profile.currentParticipationId)
      : null;

    await ctx.db.insert("proctorChunks", {
      sessionId: session._id,
      profileId: profile._id,
      index: args.index,
      startedAt: args.startedAt,
      durationMs: args.durationMs,
      bytes: args.bytes,
      mimeType: args.mimeType,
      storageId: args.storageId,
      ...(participation ? { contestId: participation.contestId } : {}),
    });
    // A slice arriving is as good a sign of life as a heartbeat.
    if (session.endedAt === undefined) await ctx.db.patch(session._id, { lastSeenAt: Date.now() });
    return null;
  },
});

export type ProctorSessionRow = {
  _id: Id<"proctorSessions">;
  username: string;
  displayName: string;
  startedAt: number;
  lastSeenAt: number;
  endedAt: number | null;
  endedReason: string | null;
  live: boolean;
  chunkCount: number;
  /** What the recording is costing, which on a small disk is the whole story. */
  bytes: number;
  contestKey: string | null;
};

async function toRow(
  ctx: Parameters<typeof activeProctorSession>[0],
  session: Doc<"proctorSessions">,
  now: number,
): Promise<ProctorSessionRow> {
  const profile = await ctx.db.get(session.profileId);
  const contest = session.contestId ? await ctx.db.get(session.contestId) : null;
  const chunks = await ctx.db
    .query("proctorChunks")
    .withIndex("by_session_index", (q) => q.eq("sessionId", session._id))
    .collect();
  return {
    _id: session._id,
    username: profile?.username ?? "?",
    displayName: profile?.usernameDisplayOverride || (profile?.username ?? "?"),
    startedAt: session.startedAt,
    lastSeenAt: session.lastSeenAt,
    endedAt: session.endedAt ?? null,
    endedReason: session.endedReason ?? null,
    live: session.endedAt === undefined && session.lastSeenAt + PROCTOR_LIVE_WINDOW_MS > now,
    chunkCount: chunks.length,
    bytes: chunks.reduce((total, chunk) => total + chunk.bytes, 0),
    contestKey: contest?.key ?? null,
  };
}

/**
 * Staff, or nothing.
 *
 * These are reactive queries, and a query that throws takes the page down with
 * it. The viewer is momentarily absent every time the auth token refreshes, so
 * throwing there turned a routine refresh into a crash that only a reload
 * cleared. An empty answer re-renders as soon as the token is back.
 */
async function staffOnly(ctx: QueryCtx): Promise<Doc<"profiles"> | null> {
  const profile = await optionalViewer(ctx);
  if (!profile) return null;
  return profile.isStaff || profile.isSuperuser ? profile : null;
}

export type TimelineSlice = {
  index: number;
  startedAt: number;
  durationMs: number;
  contestKey: string | null;
};

export type TimelineRow = {
  sessionId: Id<"proctorSessions">;
  username: string;
  displayName: string;
  startedAt: number;
  lastSeenAt: number;
  live: boolean;
  endedReason: string | null;
  bytes: number;
  slices: TimelineSlice[];
};

export type Timeline = {
  from: number;
  to: number;
  rows: TimelineRow[];
  /** Every contest anything was recorded during, for the filter. */
  contests: { key: string; name: string }[];
};

/**
 * Who was being watched, when, and what they were doing at the time.
 *
 * Keyed on time rather than on contest, because proctoring is not a contest's
 * to own: one session can span several contests and the gaps between them. The
 * contest lives on the slice, so "show me what happened during that contest"
 * is a filter over moments rather than a property of the session.
 */
export const timeline = query({
  args: {
    /**
     * The window, as a width and a distance back from now, rather than two
     * timestamps. Absolute bounds computed in the browser would change on every
     * render, and a query whose arguments never settle never resolves.
     */
    spanMs: v.optional(v.number()),
    endOffsetMs: v.optional(v.number()),
    username: v.optional(v.string()),
    contestKey: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Timeline> => {
    const now = Date.now();
    const to = now - (args.endOffsetMs ?? 0);
    const from = to - (args.spanMs ?? 24 * 60 * 60 * 1000);
    if (!(await staffOnly(ctx))) return { from, to, rows: [], contests: [] };

    const wanted = args.contestKey
      ? await ctx.db
          .query("contests")
          .withIndex("by_key", (q) => q.eq("key", args.contestKey as string))
          .unique()
      : null;

    const chunks = await ctx.db
      .query("proctorChunks")
      .withIndex("by_started", (q) => q.gte("startedAt", from).lte("startedAt", to))
      .take(20_000);

    const contestNames = new Map<string, { key: string; name: string }>();
    const bySession = new Map<string, TimelineSlice[]>();
    const bytes = new Map<string, number>();

    for (const chunk of chunks) {
      let contestKey: string | null = null;
      if (chunk.contestId) {
        const cached = contestNames.get(chunk.contestId);
        if (cached) {
          contestKey = cached.key;
        } else {
          const contest = await ctx.db.get(chunk.contestId);
          if (contest) {
            contestNames.set(chunk.contestId, { key: contest.key, name: contest.name });
            contestKey = contest.key;
          }
        }
      }
      if (wanted && chunk.contestId !== wanted._id) continue;

      const key = chunk.sessionId as string;
      const slices = bySession.get(key) ?? [];
      slices.push({
        index: chunk.index,
        startedAt: chunk.startedAt,
        durationMs: chunk.durationMs,
        contestKey,
      });
      bySession.set(key, slices);
      bytes.set(key, (bytes.get(key) ?? 0) + chunk.bytes);
    }

    const rows: TimelineRow[] = [];
    for (const [sessionId, slices] of bySession) {
      const session = await ctx.db.get(sessionId as Id<"proctorSessions">);
      if (!session) continue;
      const person = await ctx.db.get(session.profileId);
      if (args.username && person?.username !== args.username) continue;

      slices.sort((a, b) => a.startedAt - b.startedAt);
      rows.push({
        sessionId: session._id,
        username: person?.username ?? "?",
        displayName: person?.usernameDisplayOverride || (person?.username ?? "?"),
        startedAt: session.startedAt,
        lastSeenAt: session.lastSeenAt,
        live: session.endedAt === undefined && session.lastSeenAt + PROCTOR_LIVE_WINDOW_MS > now,
        endedReason: session.endedAt === undefined ? null : (session.endedReason ?? "ended"),
        bytes: bytes.get(sessionId) ?? 0,
        slices,
      });
    }
    rows.sort((a, b) => b.startedAt - a.startedAt);

    return {
      from,
      to,
      rows,
      contests: [...contestNames.values()].sort((a, b) => a.name.localeCompare(b.name)),
    };
  },
});

/** Every session, newest first, for the staff console. */
export const sessions = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<ProctorSessionRow[]> => {
    if (!(await staffOnly(ctx))) return [];

    const now = Date.now();
    const rows = await ctx.db
      .query("proctorSessions")
      .withIndex("by_lastSeen")
      .order("desc")
      .take(Math.min(args.limit ?? 50, 200));
    return await Promise.all(rows.map((session) => toRow(ctx, session, now)));
  },
});

/**
 * One slice's URL, for the hover preview on the chart.
 *
 * Fetched a slice at a time rather than returned with the timeline, because a
 * busy window is thousands of slices and signing a URL for every one of them to
 * show at most one would be work nobody asked for.
 */
export const sliceUrl = query({
  args: { sessionId: v.id("proctorSessions"), index: v.number() },
  handler: async (ctx, args): Promise<string | null> => {
    if (!(await staffOnly(ctx))) return null;
    const chunk = await ctx.db
      .query("proctorChunks")
      .withIndex("by_session_index", (q) => q.eq("sessionId", args.sessionId).eq("index", args.index))
      .unique();
    return chunk ? await ctx.storage.getUrl(chunk.storageId) : null;
  },
});

/** The slices of one session, in order, with the URLs to play them back. */
export const replay = query({
  args: { sessionId: v.id("proctorSessions") },
  handler: async (
    ctx,
    args,
  ): Promise<{
    session: ProctorSessionRow;
    chunks: { index: number; startedAt: number; durationMs: number; url: string | null }[];
  } | null> => {
    if (!(await staffOnly(ctx))) return null;

    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;

    const chunks = await ctx.db
      .query("proctorChunks")
      .withIndex("by_session_index", (q) => q.eq("sessionId", session._id))
      .collect();
    chunks.sort((a, b) => a.index - b.index);

    return {
      session: await toRow(ctx, session, Date.now()),
      chunks: await Promise.all(
        chunks.map(async (chunk) => ({
          index: chunk.index,
          startedAt: chunk.startedAt,
          durationMs: chunk.durationMs,
          url: await ctx.storage.getUrl(chunk.storageId),
        })),
      ),
    };
  },
});
