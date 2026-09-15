import type { ImportContext } from "../context.ts";
import { groupM2M } from "../context.ts";
import { problemCodeMap } from "./contests.ts";
import type { Step } from "./types.ts";

type CommentTarget =
  | { targetType: "problem" | "contest" | "solution"; key: string }
  | { targetType: "blog"; legacyBlogId: number };

/** DMOJ stores the commented page as p:code, c:key, s:code or b:id. */
function parseCommentPage(page: string): CommentTarget | null {
  const value = page.slice(2);

  if (value === "") return null;

  switch (page.slice(0, 2)) {
    case "p:":
      return { targetType: "problem", key: value };
    case "c:":
      return { targetType: "contest", key: value };
    case "s:":
      return { targetType: "solution", key: value };
    case "b:": {
      const id = Number(value);

      return Number.isFinite(id) ? { targetType: "blog", legacyBlogId: id } : null;
    }

    default:
      return null;
  }
}

function resolveTarget(
  ctx: ImportContext,
  target: CommentTarget,
  from: string,
  rowId: number,
): { targetType: string; targetKey: string } | null {
  if (target.targetType === "blog") {
    const id = ctx.ref("blogPosts", target.legacyBlogId, from, "page", rowId);

    return id ? { targetType: "blog", targetKey: id } : null;
  }

  return { targetType: target.targetType, targetKey: target.key };
}

const blogPostsStep: Step = {
  table: "blogPosts",
  sources: ["judge_blogpost", "judge_blogpost_authors"],
  async run(ctx) {
    const emitter = ctx.emitter("blogPosts");
    const authors = await groupM2M(ctx, "judge_blogpost_authors", "blogpost_id", "profile_id");

    for await (const row of ctx.rows("judge_blogpost")) {
      ctx.report.counts("blogPosts").read++;
      await emitter.emit({
        title: row.s("title"),
        authorProfileIds: ctx.refs(
          "profiles",
          authors.get(row.id()),
          "judge_blogpost_authors",
          "profile_id",
          row.id(),
        ),
        slug: row.s("slug"),
        visible: row.b("visible"),
        sticky: row.b("sticky"),
        publishOn: row.t("publish_on"),
        content: row.s("content"),
        summary: row.s("summary"),
        ogImage: row.sOpt("og_image"),
        legacyId: row.id(),
      });
    }
  },
};

const commentsStep: Step = {
  table: "comments",
  sources: ["judge_comment"],
  async run(ctx) {
    const emitter = ctx.emitter("comments");
    const rows = await ctx.all("judge_comment");
    rows.sort((a, b) => a.n("level") - b.n("level") || a.id() - b.id());

    for (const row of rows) {
      ctx.report.counts("comments").read++;
      const page = row.s("page");
      const parsed = parseCommentPage(page);

      if (!parsed) {
        ctx.report.skip("comments", `unrecognised page ${page}`, row.id());
        continue;
      }

      const target = resolveTarget(ctx, parsed, "judge_comment", row.id());

      if (!target) {
        ctx.report.skip("comments", "comment target missing", row.id());
        continue;
      }

      const authorProfileId = ctx.ref("profiles", row.n("author_id"), "judge_comment", "author_id", row.id());

      if (!authorProfileId) {
        ctx.report.skip("comments", "author missing", row.id());
        continue;
      }

      const parentLegacy = row.nOpt("parent_id");

      if (parentLegacy !== undefined && emitter.isPending(parentLegacy)) await emitter.flush();
      await emitter.emit({
        targetType: target.targetType,
        targetKey: target.targetKey,
        parentId: ctx.ref("comments", parentLegacy, "judge_comment", "parent_id", row.id()),
        authorProfileId,
        time: row.t("time"),
        score: row.n("score"),
        body: row.s("body"),
        hidden: row.b("hidden"),
        revisions: row.n("revisions"),
        legacyId: row.id(),
      });
    }
  },
};

const commentVotesStep: Step = {
  table: "commentVotes",
  sources: ["judge_commentvote"],
  async run(ctx) {
    const emitter = ctx.emitter("commentVotes");

    for await (const row of ctx.rows("judge_commentvote")) {
      ctx.report.counts("commentVotes").read++;
      const commentId = ctx.ref("comments", row.n("comment_id"), "judge_commentvote", "comment_id", row.id());

      const voterProfileId = ctx.ref(
        "profiles",
        row.n("voter_id"),
        "judge_commentvote",
        "voter_id",
        row.id(),
      );

      if (!commentId || !voterProfileId) {
        ctx.report.skip("commentVotes", "comment or voter missing", row.id());
        continue;
      }

      await emitter.emit({
        voterProfileId,
        commentId,
        score: row.n("score"),
        legacyId: row.id(),
      });
    }
  },
};

const commentLocksStep: Step = {
  table: "commentLocks",
  sources: ["judge_commentlock"],
  async run(ctx) {
    const emitter = ctx.emitter("commentLocks");

    for await (const row of ctx.rows("judge_commentlock")) {
      ctx.report.counts("commentLocks").read++;
      const page = row.s("page");
      const parsed = parseCommentPage(page);

      if (!parsed) {
        ctx.report.skip("commentLocks", `unrecognised page ${page}`, row.id());
        continue;
      }

      const target = resolveTarget(ctx, parsed, "judge_commentlock", row.id());

      if (!target) {
        ctx.report.skip("commentLocks", "lock target missing", row.id());
        continue;
      }

      await emitter.emit({
        targetType: target.targetType,
        targetKey: target.targetKey,
        legacyId: row.id(),
      });
    }
  },
};

async function contentTypeMap(ctx: ImportContext): Promise<Map<number, { app: string; model: string }>> {
  const map = new Map<number, { app: string; model: string }>();

  for await (const row of ctx.rows("django_content_type")) {
    map.set(row.id(), { app: row.s("app_label"), model: row.s("model") });
  }

  return map;
}

const ticketsStep: Step = {
  table: "tickets",
  sources: ["judge_ticket", "judge_ticket_assignees", "django_content_type"],
  async run(ctx) {
    const emitter = ctx.emitter("tickets");
    const assignees = await groupM2M(ctx, "judge_ticket_assignees", "ticket_id", "profile_id");
    const contentTypes = await contentTypeMap(ctx);
    const codes = await problemCodeMap(ctx);

    for await (const row of ctx.rows("judge_ticket")) {
      ctx.report.counts("tickets").read++;
      const profileId = ctx.ref("profiles", row.n("user_id"), "judge_ticket", "user_id", row.id());

      if (!profileId) {
        ctx.report.skip("tickets", "ticket creator missing", row.id());
        continue;
      }

      const contentType = contentTypes.get(row.n("content_type_id"));
      const objectId = row.n("object_id");
      let linkedType: string | undefined;
      let linkedKey: string | undefined;

      if (contentType) {
        linkedType = contentType.model;

        if (contentType.model === "problem") {
          const code = codes.get(objectId);

          if (code === undefined) {
            ctx.report.warn("tickets", "linked problem no longer exists, link dropped", row.id());
            linkedType = undefined;
          } else {
            linkedKey = code;
          }
        } else {
          linkedKey = String(objectId);
          ctx.report.warn("tickets", `linked item type ${contentType.model} stored by legacy id`, row.id());
        }
      }

      await emitter.emit({
        title: row.s("title"),
        profileId,
        time: row.t("time"),
        assigneeProfileIds: ctx.refs(
          "profiles",
          assignees.get(row.id()),
          "judge_ticket_assignees",
          "profile_id",
          row.id(),
        ),
        notes: row.s("notes"),
        linkedType,
        linkedKey,
        isOpen: row.b("is_open"),
        legacyId: row.id(),
      });
    }
  },
};

const ticketMessagesStep: Step = {
  table: "ticketMessages",
  sources: ["judge_ticketmessage"],
  async run(ctx) {
    const emitter = ctx.emitter("ticketMessages");

    for await (const row of ctx.rows("judge_ticketmessage")) {
      ctx.report.counts("ticketMessages").read++;
      const ticketId = ctx.ref("tickets", row.n("ticket_id"), "judge_ticketmessage", "ticket_id", row.id());
      const profileId = ctx.ref("profiles", row.n("user_id"), "judge_ticketmessage", "user_id", row.id());

      if (!ticketId || !profileId) {
        ctx.report.skip("ticketMessages", "ticket or author missing", row.id());
        continue;
      }

      await emitter.emit({
        ticketId,
        profileId,
        body: row.s("body"),
        time: row.t("time"),
        legacyId: row.id(),
      });
    }
  },
};

const REVISION_MODELS = new Map<string, string>([
  ["problem", "problems"],
  ["contest", "contests"],
  ["comment", "comments"],
]);

export const revisionsStep: Step = {
  table: "revisions",
  sources: ["reversion_version", "reversion_revision", "django_content_type"],
  async run(ctx) {
    const emitter = ctx.emitter("revisions");
    const contentTypes = await contentTypeMap(ctx);

    const revisions = new Map<number, { createdAt: number; comment: string; userId: number | undefined }>();

    for await (const row of ctx.rows("reversion_revision")) {
      revisions.set(row.id(), {
        createdAt: row.t("date_created"),
        comment: row.s("comment"),
        userId: row.nOpt("user_id"),
      });
    }

    const profileByUser = new Map<number, number>();

    for await (const row of ctx.rows("judge_profile")) profileByUser.set(row.n("user_id"), row.id());

    for await (const row of ctx.rows("reversion_version")) {
      ctx.report.counts("revisions").read++;
      const contentType = contentTypes.get(row.n("content_type_id"));
      const entityType = contentType ? REVISION_MODELS.get(contentType.model) : undefined;

      if (!contentType || !entityType || contentType.app !== "judge") {
        ctx.report.skip(
          "revisions",
          `content type ${contentType ? `${contentType.app}.${contentType.model}` : "unknown"} is not versioned in MOJ`,
          row.id(),
        );
        continue;
      }

      const legacyObjectId = Number(row.s("object_id"));

      if (!Number.isFinite(legacyObjectId)) {
        ctx.report.skip("revisions", "non numeric object_id", row.id());
        continue;
      }

      const entityId = ctx.ref(entityType, legacyObjectId, "reversion_version", "object_id", row.id());

      if (!entityId) {
        ctx.report.skip("revisions", `${contentType.model} no longer exists`, row.id());
        continue;
      }

      const revision = revisions.get(row.n("revision_id"));

      const authorLegacyProfile =
        revision?.userId === undefined ? undefined : profileByUser.get(revision.userId);

      await emitter.emit({
        entityType,
        entityId,
        snapshot: row.json("serialized_data"),
        authorProfileId: ctx.ref("profiles", authorLegacyProfile, "reversion_revision", "user_id", row.id()),
        reason: revision?.comment ?? "",
        createdAt: revision?.createdAt ?? 0,
      });
    }

    ctx.report.note("only problem, contest and comment revisions are imported");
  },
};

export const socialSteps: Step[] = [
  blogPostsStep,
  commentsStep,
  commentVotesStep,
  commentLocksStep,
  ticketsStep,
  ticketMessagesStep,
];
