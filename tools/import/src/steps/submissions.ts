import type { ImportContext } from "../context.ts";
import type { Step } from "./types.ts";

const STATUSES = new Set(["QU", "P", "G", "D", "IE", "CE", "AB"]);
const RESULTS = new Set(["AC", "WA", "TLE", "MLE", "OLE", "IR", "RTE", "CE", "IE", "SC", "AB"]);

interface ContestSubmission {
  participationLegacyId: number;
  contestProblemLegacyId: number;
  points: number;
  isPretest: boolean;
}

async function contestSubmissions(ctx: ImportContext): Promise<Map<number, ContestSubmission>> {
  const map = new Map<number, ContestSubmission>();
  for await (const row of ctx.rows("judge_contestsubmission")) {
    map.set(row.n("submission_id"), {
      participationLegacyId: row.n("participation_id"),
      contestProblemLegacyId: row.n("problem_id"),
      points: row.n("points"),
      isPretest: row.b("is_pretest"),
    });
  }
  return map;
}

export const submissionsStep: Step = {
  table: "submissions",
  sources: ["judge_submission", "judge_contestsubmission"],
  async run(ctx) {
    const emitter = ctx.emitter("submissions");
    const contestRows = await contestSubmissions(ctx);

    for await (const row of ctx.rows("judge_submission")) {
      ctx.report.counts("submissions").read++;
      const id = row.id();
      const profileId = ctx.ref("profiles", row.n("user_id"), "judge_submission", "user_id", id);
      const problemId = ctx.ref("problems", row.n("problem_id"), "judge_submission", "problem_id", id);
      const languageId = ctx.ref("languages", row.n("language_id"), "judge_submission", "language_id", id);
      if (!profileId || !problemId || !languageId) {
        ctx.report.skip("submissions", "profile, problem or language missing", id);
        continue;
      }

      const status = row.s("status");
      if (!STATUSES.has(status)) ctx.report.warn("submissions", `unknown status ${status}, stored as IE`, id);
      const result = row.sOpt("result");
      if (result !== undefined && !RESULTS.has(result)) {
        ctx.report.warn("submissions", `unknown result ${result}, dropped`, id);
      }

      const contest = contestRows.get(id);
      const doc: Record<string, unknown> = {
        profileId,
        problemId,
        date: row.t("date"),
        time: row.nOpt("time"),
        memory: row.nOpt("memory"),
        points: row.nOpt("points"),
        languageId,
        status: STATUSES.has(status) ? status : "IE",
        result: result !== undefined && RESULTS.has(result) ? result : undefined,
        error: row.sOpt("error"),
        currentTestcase: row.n("current_testcase"),
        batch: row.b("batch"),
        casePoints: row.n("case_points"),
        caseTotal: row.n("case_total"),
        judgedOnJudgeId: ctx.ref("judges", row.nOpt("judged_on_id"), "judge_submission", "judged_on_id", id),
        judgedDate: row.tOpt("judged_date"),
        rejudgedDate: row.tOpt("rejudged_date"),
        isPretested: row.b("is_pretested"),
        contestId: ctx.ref(
          "contests",
          row.nOpt("contest_object_id"),
          "judge_submission",
          "contest_object_id",
          id,
        ),
        lockedAfter: row.tOpt("locked_after"),
        isArchived: row.has("is_archived") ? row.b("is_archived") : false,
        priority: 1,
        retryCount: 0,
        legacyId: id,
      };

      if (contest) {
        doc.contestProblemId = ctx.ref(
          "contestProblems",
          contest.contestProblemLegacyId,
          "judge_contestsubmission",
          "problem_id",
          id,
        );
        doc.participationId = ctx.ref(
          "contestParticipations",
          contest.participationLegacyId,
          "judge_contestsubmission",
          "participation_id",
          id,
        );
        doc.contestPoints = contest.points;
        doc.isContestPretest = contest.isPretest;
      }

      await emitter.emit(doc);
    }
  },
};

export const submissionSourcesStep: Step = {
  table: "submissionSources",
  sources: ["judge_submissionsource"],
  async run(ctx) {
    const emitter = ctx.emitter("submissionSources");
    for await (const row of ctx.rows("judge_submissionsource")) {
      ctx.report.counts("submissionSources").read++;
      const submissionId = ctx.ref(
        "submissions",
        row.n("submission_id"),
        "judge_submissionsource",
        "submission_id",
        row.id(),
      );
      if (!submissionId) {
        ctx.report.skip("submissionSources", "submission missing", row.id());
        continue;
      }
      await emitter.emit({
        submissionId,
        source: row.s("source"),
        legacyId: row.id(),
      });
    }
  },
};

export const submissionTestCasesStep: Step = {
  table: "submissionTestCases",
  sources: ["judge_submissiontestcase"],
  async run(ctx) {
    const emitter = ctx.emitter("submissionTestCases");
    for await (const row of ctx.rows("judge_submissiontestcase")) {
      ctx.report.counts("submissionTestCases").read++;
      const submissionId = ctx.ref(
        "submissions",
        row.n("submission_id"),
        "judge_submissiontestcase",
        "submission_id",
        row.id(),
      );
      if (!submissionId) {
        ctx.report.skip("submissionTestCases", "submission missing", row.id());
        continue;
      }
      await emitter.emit({
        submissionId,
        case: row.n("case"),
        status: row.s("status"),
        time: row.n("time"),
        memory: row.n("memory"),
        points: row.n("points"),
        total: row.n("total"),
        batch: row.nOpt("batch"),
        feedback: row.s("feedback"),
        extendedFeedback: row.s("extended_feedback"),
        output: row.s("output"),
        legacyId: row.id(),
      });
    }
  },
};

export const submissionSteps: Step[] = [submissionsStep, submissionSourcesStep, submissionTestCasesStep];
