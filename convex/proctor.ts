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
import { mutation, query } from "./_generated/server";
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

    await ctx.db.insert("proctorChunks", {
      sessionId: session._id,
      profileId: profile._id,
      index: args.index,
      startedAt: args.startedAt,
      durationMs: args.durationMs,
      bytes: args.bytes,
      mimeType: args.mimeType,
      storageId: args.storageId,
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

/** Every session, newest first, for the staff console. */
export const sessions = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<ProctorSessionRow[]> => {
    const profile = await requireViewer(ctx);
    if (!profile.isStaff && !profile.isSuperuser) throw forbidden();

    const now = Date.now();
    const rows = await ctx.db
      .query("proctorSessions")
      .withIndex("by_lastSeen")
      .order("desc")
      .take(Math.min(args.limit ?? 50, 200));
    return await Promise.all(rows.map((session) => toRow(ctx, session, now)));
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
    const profile = await requireViewer(ctx);
    if (!profile.isStaff && !profile.isSuperuser) throw forbidden();

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
