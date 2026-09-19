import { createHash } from "node:crypto";
import type { ImportContext } from "../context.ts";
import { groupM2M } from "../context.ts";
import { isJsonObject, type JsonObject, type JsonValue } from "../json.ts";
import type { Step } from "./types.ts";

const SCOREBOARD_VISIBILITY = new Set(["V", "C", "P", "H"]);

/**
 * DMOJ's four scoreboard policies as an audience policy. Hidden ("H") still let
 * spectators watch, which the spectator flag now carries.
 */
function scoreboardPolicy(visibility: string): JsonObject {
  switch (visibility) {
    case "C":
      return { audiences: ["everyone"], from: "end" };
    case "P":
      return { audiences: ["everyone"], from: "ownEnd" };
    case "H":
      return { audiences: [], from: "start" };
    default:
      return { audiences: ["everyone"], from: "start" };
  }
}

/**
 * DMOJ keys `format_data` by `ContestProblem.id`, so the numbers in the dump
 * mean nothing once the rows are in Convex. Rewrite them to the new ids;
 * anything that no longer resolves is dropped, as its contest problem was.
 */
function remapFormatData(ctx: ImportContext, formatData: JsonValue, rowId: number): JsonValue {
  if (formatData === null) return null;

  if (!isJsonObject(formatData)) return formatData;
  const out: JsonObject = {};

  for (const [key, value] of Object.entries(formatData)) {
    const legacyId = Number(key);

    if (!Number.isInteger(legacyId)) {
      // Not a contest problem id: keep it, whatever a future format stores.
      out[key] = value;
      continue;
    }

    const id = ctx.ref("contestProblems", legacyId, "judge_contestparticipation", "format_data", rowId);

    if (id !== undefined) out[id] = value;
  }

  return out;
}

/** Django DurationField is stored as microseconds on MariaDB. */
function durationToSeconds(micros: number | undefined): number | undefined {
  if (micros === undefined) return undefined;

  return micros / 1_000_000;
}

export async function problemCodeMap(ctx: ImportContext): Promise<Map<number, string>> {
  const map = new Map<number, string>();

  for await (const row of ctx.rows("judge_problem")) map.set(row.id(), row.s("code"));

  return map;
}

async function languageKeyMap(ctx: ImportContext): Promise<Map<number, string>> {
  const map = new Map<number, string>();

  for await (const row of ctx.rows("judge_language")) map.set(row.id(), row.s("key"));

  return map;
}

const judgesStep: Step = {
  table: "judges",
  sources: ["judge_judge", "judge_judge_problems", "judge_judge_runtimes"],
  async run(ctx) {
    const emitter = ctx.emitter("judges");
    const codes = await problemCodeMap(ctx);
    const keys = await languageKeyMap(ctx);
    const problems = await groupM2M(ctx, "judge_judge_problems", "judge_id", "problem_id");
    const runtimes = await groupM2M(ctx, "judge_judge_runtimes", "judge_id", "language_id");

    for await (const row of ctx.rows("judge_judge")) {
      ctx.report.counts("judges").read++;
      const id = row.id();
      await emitter.emit({
        name: row.s("name"),
        authKeyHash: createHash("sha256").update(row.s("auth_key"), "utf8").digest("hex"),
        isBlocked: row.b("is_blocked"),
        isDisabled: row.b("is_disabled"),
        tier: 0,
        online: false,
        startTime: row.tOpt("start_time"),
        ping: row.nOpt("ping"),
        load: row.nOpt("load"),
        description: row.s("description"),
        lastIp: row.sOpt("last_ip"),
        problemCodes: (problems.get(id) ?? []).flatMap((problemId) => {
          const code = codes.get(problemId);

          return code === undefined ? [] : [code];
        }),
        runtimeKeys: (runtimes.get(id) ?? []).flatMap((languageId) => {
          const key = keys.get(languageId);

          return key === undefined ? [] : [key];
        }),
        legacyId: id,
      });
    }

    ctx.report.note("judges are imported offline with tier 0 and no current submission");
  },
};

const runtimeVersionsStep: Step = {
  table: "runtimeVersions",
  sources: ["judge_runtimeversion"],
  async run(ctx) {
    const emitter = ctx.emitter("runtimeVersions");

    for await (const row of ctx.rows("judge_runtimeversion")) {
      ctx.report.counts("runtimeVersions").read++;
      const judgeId = ctx.ref("judges", row.n("judge_id"), "judge_runtimeversion", "judge_id", row.id());

      const languageId = ctx.ref(
        "languages",
        row.n("language_id"),
        "judge_runtimeversion",
        "language_id",
        row.id(),
      );

      if (!judgeId || !languageId) {
        ctx.report.skip("runtimeVersions", "judge or language missing", row.id());
        continue;
      }

      await emitter.emit({
        languageId,
        judgeId,
        name: row.s("name"),
        version: row.s("version"),
        priority: row.n("priority"),
        legacyId: row.id(),
      });
    }
  },
};

const contestTagsStep: Step = {
  table: "contestTags",
  sources: ["judge_contesttag"],
  async run(ctx) {
    const emitter = ctx.emitter("contestTags");

    for await (const row of ctx.rows("judge_contesttag")) {
      ctx.report.counts("contestTags").read++;
      await emitter.emit({
        name: row.s("name"),
        color: row.s("color"),
        description: row.s("description"),
        legacyId: row.id(),
      });
    }
  },
};

const contestsStep: Step = {
  table: "contests",
  sources: [
    "judge_contest",
    "judge_contest_authors",
    "judge_contest_curators",
    "judge_contest_testers",
    "judge_contest_spectators",
    "judge_contest_banned_users",
    "judge_contest_private_contestants",
    "judge_contest_rate_exclude",
    "judge_contest_view_contest_scoreboard",
    "judge_contest_view_contest_submissions",
    "judge_contest_organizations",
    "judge_contest_join_organizations",
    "judge_contest_classes",
    "judge_contest_tags",
  ],
  async run(ctx) {
    const emitter = ctx.emitter("contests");
    const authors = await groupM2M(ctx, "judge_contest_authors", "contest_id", "profile_id");
    const curators = await groupM2M(ctx, "judge_contest_curators", "contest_id", "profile_id");
    const testers = await groupM2M(ctx, "judge_contest_testers", "contest_id", "profile_id");
    const spectators = await groupM2M(ctx, "judge_contest_spectators", "contest_id", "profile_id");
    const banned = await groupM2M(ctx, "judge_contest_banned_users", "contest_id", "profile_id");

    const privateContestants = await groupM2M(
      ctx,
      "judge_contest_private_contestants",
      "contest_id",
      "profile_id",
    );

    const rateExclude = await groupM2M(ctx, "judge_contest_rate_exclude", "contest_id", "profile_id");

    const viewScoreboard = await groupM2M(
      ctx,
      "judge_contest_view_contest_scoreboard",
      "contest_id",
      "profile_id",
    );

    const viewSubmissions = await groupM2M(
      ctx,
      "judge_contest_view_contest_submissions",
      "contest_id",
      "profile_id",
    );

    const organizations = await groupM2M(ctx, "judge_contest_organizations", "contest_id", "organization_id");

    const joinOrganizations = await groupM2M(
      ctx,
      "judge_contest_join_organizations",
      "contest_id",
      "organization_id",
    );

    const classes = await groupM2M(ctx, "judge_contest_classes", "contest_id", "class_id");
    const tags = await groupM2M(ctx, "judge_contest_tags", "contest_id", "contesttag_id");

    for await (const row of ctx.rows("judge_contest")) {
      ctx.report.counts("contests").read++;
      const id = row.id();
      const visibility = row.s("scoreboard_visibility");

      if (!SCOREBOARD_VISIBILITY.has(visibility)) {
        ctx.report.warn("contests", `unknown scoreboard_visibility ${visibility}, stored as V`, id);
      }

      // A Lua label script is not portable; the contest letters its problems.
      if (row.s("problem_label_script").trim() !== "") {
        ctx.report.warn("contests", "problem_label_script is not portable, problems are lettered", id);
      }

      const organizationIds = ctx.refs(
        "organizations",
        organizations.get(id),
        "judge_contest_organizations",
        "organization_id",
        id,
      );

      const classIds = ctx.refs("classes", classes.get(id), "judge_contest_classes", "class_id", id);

      const namedProfileIds = ctx.refs(
        "profiles",
        privateContestants.get(id),
        "judge_contest_private_contestants",
        "profile_id",
        id,
      );

      // DMOJ's two flags each gate on their own lists, and both have to be
      // cleared. A flag on with nothing behind it admitted nobody; here the
      // gate simply is not there, which only differs when the other one is.
      const byOrganization = row.b("is_organization_private");
      const byName = row.b("is_private");

      const entry: JsonObject =
        byOrganization || byName
          ? {
              kind: "restricted" as const,
              match: "all" as const,
              organizationIds: byOrganization ? organizationIds : [],
              classIds: byOrganization ? classIds : [],
              profileIds: byName ? namedProfileIds : [],
            }
          : { kind: "open" as const };

      const joinOrganizationIds = ctx.refs(
        "organizations",
        joinOrganizations.get(id),
        "judge_contest_join_organizations",
        "organization_id",
        id,
      );

      // A limit naming nobody let nobody join. Nothing wants to say that, so it
      // imports as no limit, and the report says which contests changed.
      if (row.b("limit_join_organizations") && joinOrganizationIds.length === 0) {
        ctx.report.warn(
          "contests",
          "limit_join_organizations named no organisation, imported as no limit",
          id,
        );
      }

      const windowSeconds = durationToSeconds(row.nOpt("time_limit"));
      const floor = row.nOpt("rating_floor");
      const ceiling = row.nOpt("rating_ceiling");

      const rating: JsonObject = {
        everyone: row.b("rate_all"),
        excludeProfileIds: ctx.refs(
          "profiles",
          rateExclude.get(id),
          "judge_contest_rate_exclude",
          "profile_id",
          id,
        ),
        ...(floor !== undefined && { floor }),
        ...(ceiling !== undefined && { ceiling }),
      };

      await emitter.emit({
        key: row.s("key"),
        name: row.s("name"),
        authorProfileIds: ctx.refs("profiles", authors.get(id), "judge_contest_authors", "profile_id", id),
        curatorProfileIds: ctx.refs("profiles", curators.get(id), "judge_contest_curators", "profile_id", id),
        testerProfileIds: ctx.refs("profiles", testers.get(id), "judge_contest_testers", "profile_id", id),
        spectatorProfileIds: ctx.refs(
          "profiles",
          spectators.get(id),
          "judge_contest_spectators",
          "profile_id",
          id,
        ),
        testerSeeScoreboard: row.b("tester_see_scoreboard"),
        testerSeeSubmissions: row.b("tester_see_submissions"),
        // DMOJ always showed spectators the board once the contest started.
        spectatorSeeScoreboard: true,
        spectatorSeeProblemsEarly: false,
        description: row.s("description"),
        startTime: row.t("start_time"),
        endTime: row.t("end_time"),
        schedule: windowSeconds
          ? { kind: "window" as const, seconds: windowSeconds }
          : { kind: "together" as const },
        isVisible: row.b("is_visible"),
        entry,
        isOpenEntry: entry.kind === "open",
        joinLimit: joinOrganizationIds.length > 0 ? { organizationIds: joinOrganizationIds } : undefined,
        rating: row.b("is_rated") ? rating : undefined,
        labels: { kind: "letters" as const },
        alwaysAdmitProfileIds: ctx.refs(
          "profiles",
          viewScoreboard.get(id),
          "judge_contest_view_contest_scoreboard",
          "profile_id",
          id,
        ),
        viewContestSubmissionsProfileIds: ctx.refs(
          "profiles",
          viewSubmissions.get(id),
          "judge_contest_view_contest_submissions",
          "profile_id",
          id,
        ),
        scoreboard: scoreboardPolicy(visibility),
        useClarifications: row.b("use_clarifications"),
        hideProblemTags: row.b("hide_problem_tags"),
        hideProblemAuthors: row.b("hide_problem_authors"),
        runPretestsOnly: row.b("run_pretests_only"),
        tagIds: ctx.refs("contestTags", tags.get(id), "judge_contest_tags", "contesttag_id", id),
        userCount: row.n("user_count"),
        summary: row.sOpt("summary"),
        accessCode: row.sOpt("access_code"),
        bannedProfileIds: ctx.refs(
          "profiles",
          banned.get(id),
          "judge_contest_banned_users",
          "profile_id",
          id,
        ),
        formatName: row.s("format_name"),
        formatConfig: row.json("format_config"),
        lockedAfter: row.tOpt("locked_after"),
        pointsPrecision: row.n("points_precision"),
        legacyId: id,
      });
    }
  },
};

const contestProblemsStep: Step = {
  table: "contestProblems",
  sources: ["judge_contestproblem"],
  async run(ctx) {
    const emitter = ctx.emitter("contestProblems");

    for await (const row of ctx.rows("judge_contestproblem")) {
      ctx.report.counts("contestProblems").read++;

      const contestId = ctx.ref(
        "contests",
        row.n("contest_id"),
        "judge_contestproblem",
        "contest_id",
        row.id(),
      );

      const problemId = ctx.ref(
        "problems",
        row.n("problem_id"),
        "judge_contestproblem",
        "problem_id",
        row.id(),
      );

      if (!contestId || !problemId) {
        ctx.report.skip("contestProblems", "contest or problem missing", row.id());
        continue;
      }

      await emitter.emit({
        contestId,
        problemId,
        points: row.n("points"),
        partial: row.b("partial"),
        isPretested: row.b("is_pretested"),
        order: row.n("order"),
        outputPrefixOverride: row.nOpt("output_prefix_override"),
        maxSubmissions: row.nOpt("max_submissions"),
        legacyId: row.id(),
      });
    }
  },
};

const contestParticipationsStep: Step = {
  table: "contestParticipations",
  sources: ["judge_contestparticipation"],
  async run(ctx) {
    const emitter = ctx.emitter("contestParticipations");

    for await (const row of ctx.rows("judge_contestparticipation")) {
      ctx.report.counts("contestParticipations").read++;

      const contestId = ctx.ref(
        "contests",
        row.n("contest_id"),
        "judge_contestparticipation",
        "contest_id",
        row.id(),
      );

      const profileId = ctx.ref(
        "profiles",
        row.n("user_id"),
        "judge_contestparticipation",
        "user_id",
        row.id(),
      );

      if (!contestId || !profileId) {
        ctx.report.skip("contestParticipations", "contest or profile missing", row.id());
        continue;
      }

      await emitter.emit({
        contestId,
        profileId,
        realStart: row.t("start"),
        score: row.n("score"),
        cumtime: row.n("cumtime"),
        isDisqualified: row.b("is_disqualified"),
        tiebreaker: row.n("tiebreaker"),
        virtual: row.n("virtual"),
        formatData: remapFormatData(ctx, row.json("format_data"), row.id()),
        legacyId: row.id(),
      });
    }
  },
};

const ratingsStep: Step = {
  table: "ratings",
  sources: ["judge_rating"],
  async run(ctx) {
    const emitter = ctx.emitter("ratings");

    for await (const row of ctx.rows("judge_rating")) {
      ctx.report.counts("ratings").read++;
      const profileId = ctx.ref("profiles", row.n("user_id"), "judge_rating", "user_id", row.id());
      const contestId = ctx.ref("contests", row.n("contest_id"), "judge_rating", "contest_id", row.id());

      const participationId = ctx.ref(
        "contestParticipations",
        row.n("participation_id"),
        "judge_rating",
        "participation_id",
        row.id(),
      );

      if (!profileId || !contestId || !participationId) {
        ctx.report.skip("ratings", "profile, contest or participation missing", row.id());
        continue;
      }

      await emitter.emit({
        profileId,
        contestId,
        participationId,
        rank: row.n("rank"),
        rating: row.n("rating"),
        mean: row.n("mean"),
        performance: row.n("performance"),
        lastRated: row.t("last_rated"),
        legacyId: row.id(),
      });
    }
  },
};

const contestMossStep: Step = {
  table: "contestMoss",
  sources: ["judge_contestmoss"],
  async run(ctx) {
    const emitter = ctx.emitter("contestMoss");

    for await (const row of ctx.rows("judge_contestmoss")) {
      ctx.report.counts("contestMoss").read++;
      const contestId = ctx.ref("contests", row.n("contest_id"), "judge_contestmoss", "contest_id", row.id());
      const problemId = ctx.ref("problems", row.n("problem_id"), "judge_contestmoss", "problem_id", row.id());

      if (!contestId || !problemId) {
        ctx.report.skip("contestMoss", "contest or problem missing", row.id());
        continue;
      }

      await emitter.emit({
        contestId,
        problemId,
        languageKey: row.s("language"),
        submissionCount: row.n("submission_count"),
        url: row.sOpt("url"),
        legacyId: row.id(),
      });
    }
  },
};

export const contestSteps: Step[] = [
  judgesStep,
  runtimeVersionsStep,
  contestTagsStep,
  contestsStep,
  contestProblemsStep,
  contestParticipationsStep,
];

export const contestTailSteps: Step[] = [ratingsStep, contestMossStep];
