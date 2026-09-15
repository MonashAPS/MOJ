import { groupM2M } from "../context.ts";
import type { Step } from "./types.ts";

const SOURCE_VISIBILITY = new Set(["A", "S", "O", "F"]);

const TEST_CASE_TYPES = new Set(["C", "S", "E"]);

export const problemsStep: Step = {
  table: "problems",
  sources: [
    "judge_problem",
    "judge_problem_authors",
    "judge_problem_curators",
    "judge_problem_testers",
    "judge_problem_types",
    "judge_problem_allowed_languages",
    "judge_problem_banned_users",
    "judge_problem_organizations",
  ],
  async run(ctx) {
    const emitter = ctx.emitter("problems");
    const authors = await groupM2M(ctx, "judge_problem_authors", "problem_id", "profile_id");
    const curators = await groupM2M(ctx, "judge_problem_curators", "problem_id", "profile_id");
    const testers = await groupM2M(ctx, "judge_problem_testers", "problem_id", "profile_id");
    const types = await groupM2M(ctx, "judge_problem_types", "problem_id", "problemtype_id");
    const allowed = await groupM2M(ctx, "judge_problem_allowed_languages", "problem_id", "language_id");
    const banned = await groupM2M(ctx, "judge_problem_banned_users", "problem_id", "profile_id");
    const organizations = await groupM2M(ctx, "judge_problem_organizations", "problem_id", "organization_id");

    for await (const row of ctx.rows("judge_problem")) {
      ctx.report.counts("problems").read++;
      const id = row.id();
      const groupId = ctx.ref("problemGroups", row.n("group_id"), "judge_problem", "group_id", id);

      if (!groupId) {
        ctx.report.skip("problems", "problem group missing", id);
        continue;
      }

      const date = row.tOpt("date");

      if (date === undefined) ctx.report.warn("problems", "null date, stored as 0", id);
      const visibility = row.s("submission_source_visibility_mode");

      if (!SOURCE_VISIBILITY.has(visibility)) {
        ctx.report.warn(
          "problems",
          `unknown submission_source_visibility_mode ${visibility}, stored as F`,
          id,
        );
      }

      await emitter.emit({
        code: row.s("code"),
        name: row.s("name"),
        description: row.s("description"),
        authorProfileIds: ctx.refs("profiles", authors.get(id), "judge_problem_authors", "profile_id", id),
        curatorProfileIds: ctx.refs("profiles", curators.get(id), "judge_problem_curators", "profile_id", id),
        testerProfileIds: ctx.refs("profiles", testers.get(id), "judge_problem_testers", "profile_id", id),
        typeIds: ctx.refs("problemTypes", types.get(id), "judge_problem_types", "problemtype_id", id),
        groupId,
        timeLimit: row.n("time_limit"),
        memoryLimit: row.n("memory_limit"),
        shortCircuit: row.b("short_circuit"),
        points: row.n("points"),
        partial: row.b("partial"),
        allowedLanguageIds: ctx.refs(
          "languages",
          allowed.get(id),
          "judge_problem_allowed_languages",
          "language_id",
          id,
        ),
        isPublic: row.b("is_public"),
        isManuallyManaged: row.b("is_manually_managed"),
        date: date ?? 0,
        bannedProfileIds: ctx.refs(
          "profiles",
          banned.get(id),
          "judge_problem_banned_users",
          "profile_id",
          id,
        ),
        licenseId: ctx.ref("licenses", row.nOpt("license_id"), "judge_problem", "license_id", id),
        ogImage: row.sOpt("og_image"),
        summary: row.sOpt("summary"),
        userCount: row.n("user_count"),
        acRate: row.n("ac_rate"),
        isFullMarkup: row.b("is_full_markup"),
        submissionSourceVisibility: SOURCE_VISIBILITY.has(visibility) ? visibility : "F",
        organizationIds: ctx.refs(
          "organizations",
          organizations.get(id),
          "judge_problem_organizations",
          "organization_id",
          id,
        ),
        isOrganizationPrivate: row.b("is_organization_private"),
        legacyId: id,
      });
    }
  },
};

export const problemTranslationsStep: Step = {
  table: "problemTranslations",
  sources: ["judge_problemtranslation"],
  async run(ctx) {
    const emitter = ctx.emitter("problemTranslations");

    for await (const row of ctx.rows("judge_problemtranslation")) {
      ctx.report.counts("problemTranslations").read++;

      const problemId = ctx.ref(
        "problems",
        row.n("problem_id"),
        "judge_problemtranslation",
        "problem_id",
        row.id(),
      );

      if (!problemId) {
        ctx.report.skip("problemTranslations", "problem missing", row.id());
        continue;
      }

      await emitter.emit({
        problemId,
        language: row.s("language"),
        name: row.s("name"),
        description: row.s("description"),
        legacyId: row.id(),
      });
    }
  },
};

export const problemClarificationsStep: Step = {
  table: "problemClarifications",
  sources: ["judge_problemclarification"],
  async run(ctx) {
    const emitter = ctx.emitter("problemClarifications");

    for await (const row of ctx.rows("judge_problemclarification")) {
      ctx.report.counts("problemClarifications").read++;

      const problemId = ctx.ref(
        "problems",
        row.n("problem_id"),
        "judge_problemclarification",
        "problem_id",
        row.id(),
      );

      if (!problemId) {
        ctx.report.skip("problemClarifications", "problem missing", row.id());
        continue;
      }

      await emitter.emit({
        problemId,
        description: row.s("description"),
        date: row.t("date"),
        legacyId: row.id(),
      });
    }
  },
};

export const languageLimitsStep: Step = {
  table: "languageLimits",
  sources: ["judge_languagelimit"],
  async run(ctx) {
    const emitter = ctx.emitter("languageLimits");

    for await (const row of ctx.rows("judge_languagelimit")) {
      ctx.report.counts("languageLimits").read++;

      const problemId = ctx.ref(
        "problems",
        row.n("problem_id"),
        "judge_languagelimit",
        "problem_id",
        row.id(),
      );

      const languageId = ctx.ref(
        "languages",
        row.n("language_id"),
        "judge_languagelimit",
        "language_id",
        row.id(),
      );

      if (!problemId || !languageId) {
        ctx.report.skip("languageLimits", "problem or language missing", row.id());
        continue;
      }

      await emitter.emit({
        problemId,
        languageId,
        timeLimit: row.n("time_limit"),
        memoryLimit: row.n("memory_limit"),
        legacyId: row.id(),
      });
    }
  },
};

export const solutionsStep: Step = {
  table: "solutions",
  sources: ["judge_solution", "judge_solution_authors"],
  async run(ctx) {
    const emitter = ctx.emitter("solutions");
    const authors = await groupM2M(ctx, "judge_solution_authors", "solution_id", "profile_id");

    for await (const row of ctx.rows("judge_solution")) {
      ctx.report.counts("solutions").read++;
      const problemId = ctx.ref("problems", row.n("problem_id"), "judge_solution", "problem_id", row.id());

      if (!problemId) {
        ctx.report.skip("solutions", "problem missing", row.id());
        continue;
      }

      await emitter.emit({
        problemId,
        isPublic: row.b("is_public"),
        publishOn: row.t("publish_on"),
        authorProfileIds: ctx.refs(
          "profiles",
          authors.get(row.id()),
          "judge_solution_authors",
          "profile_id",
          row.id(),
        ),
        content: row.s("content"),
        legacyId: row.id(),
      });
    }
  },
};

export const problemPointsVotesStep: Step = {
  table: "problemPointsVotes",
  sources: ["judge_problempointsvote"],
  async run(ctx) {
    const emitter = ctx.emitter("problemPointsVotes");

    for await (const row of ctx.rows("judge_problempointsvote")) {
      ctx.report.counts("problemPointsVotes").read++;

      const problemId = ctx.ref(
        "problems",
        row.n("problem_id"),
        "judge_problempointsvote",
        "problem_id",
        row.id(),
      );

      const voterProfileId = ctx.ref(
        "profiles",
        row.n("voter_id"),
        "judge_problempointsvote",
        "voter_id",
        row.id(),
      );

      if (!problemId || !voterProfileId) {
        ctx.report.skip("problemPointsVotes", "problem or voter missing", row.id());
        continue;
      }

      await emitter.emit({
        points: row.n("points"),
        voterProfileId,
        problemId,
        voteTime: row.t("vote_time"),
        note: row.s("note"),
        legacyId: row.id(),
      });
    }
  },
};

export const problemDataStep: Step = {
  table: "problemData",
  sources: ["judge_problemdata"],
  async run(ctx) {
    const emitter = ctx.emitter("problemData");

    for await (const row of ctx.rows("judge_problemdata")) {
      ctx.report.counts("problemData").read++;
      const problemId = ctx.ref("problems", row.n("problem_id"), "judge_problemdata", "problem_id", row.id());

      if (!problemId) {
        ctx.report.skip("problemData", "problem missing", row.id());
        continue;
      }

      await emitter.emit({
        problemId,
        zipfile: row.sOpt("zipfile"),
        generator: row.sOpt("generator"),
        outputPrefix: row.nOpt("output_prefix"),
        outputLimit: row.nOpt("output_limit"),
        feedback: row.s("feedback"),
        checker: row.sOpt("checker"),
        checkerArgs: row.sOpt("checker_args"),
        unicode: row.b("unicode"),
        nobigmath: row.b("nobigmath"),
        legacyId: row.id(),
      });
    }
  },
};

export const problemTestCasesStep: Step = {
  table: "problemTestCases",
  sources: ["judge_problemtestcase"],
  async run(ctx) {
    const emitter = ctx.emitter("problemTestCases");

    for await (const row of ctx.rows("judge_problemtestcase")) {
      ctx.report.counts("problemTestCases").read++;

      const problemId = ctx.ref(
        "problems",
        row.n("dataset_id"),
        "judge_problemtestcase",
        "dataset_id",
        row.id(),
      );

      if (!problemId) {
        ctx.report.skip("problemTestCases", "problem missing", row.id());
        continue;
      }

      const type = row.s("type");

      if (!TEST_CASE_TYPES.has(type)) {
        ctx.report.warn("problemTestCases", `unknown case type ${type}, stored as C`, row.id());
      }

      await emitter.emit({
        problemId,
        order: row.n("order"),
        type: TEST_CASE_TYPES.has(type) ? type : "C",
        inputFile: row.s("input_file"),
        outputFile: row.s("output_file"),
        generatorArgs: row.s("generator_args"),
        points: row.n("points"),
        isPretest: row.b("is_pretest"),
        outputPrefix: row.nOpt("output_prefix"),
        outputLimit: row.nOpt("output_limit"),
        checker: row.sOpt("checker"),
        checkerArgs: row.sOpt("checker_args"),
        batchDependencies: [],
        legacyId: row.id(),
      });
    }
  },
};

export const problemSteps: Step[] = [
  problemsStep,
  problemTranslationsStep,
  problemClarificationsStep,
  languageLimitsStep,
  solutionsStep,
  problemPointsVotesStep,
  problemDataStep,
  problemTestCasesStep,
];
