// @vitest-environment edge-runtime

/**
 * What the contest's problem list can offer beside each problem.
 *
 * The list carries a statement download, a sample download and a submit button
 * now, and two of those need something the row did not say: whether the
 * statement has samples in it at all, and how many submissions this run has
 * left. Both are counted for the whole table at once rather than per row.
 */

import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import {
  asUser,
  HOUR,
  insertContest,
  insertContestProblem,
  insertLanguage,
  insertParticipation,
  insertProblem,
  insertProfile,
  insertSubmission,
} from "./test.fixtures";
import { setupTest, type T } from "./test.setup";

const WITH_SAMPLES = [
  "Add two numbers.",
  "",
  "## Sample Input",
  "",
  "    1 2",
  "",
  "## Sample Output",
  "",
  "    3",
].join("\n");

const WITHOUT_SAMPLES = "Print anything at all. There is no example here.";

async function seed(t: T, descriptions: readonly string[]) {
  const contestId = await insertContest(t, { key: "live", startTime: Date.now() - HOUR });
  const playerId = await insertProfile(t, { username: "player" });

  for (const [index, description] of descriptions.entries()) {
    const problemId = await insertProblem(t, { code: `p${index}`, description });
    await insertContestProblem(t, { contestId, problemId, order: index, points: 100 });
  }

  const participationId = await insertParticipation(t, { contestId, profileId: playerId });
  await t.run(async (ctx) => ctx.db.patch(playerId, { currentParticipationId: participationId }));

  return { contestId, playerId, participationId };
}

async function problemsFor(t: T) {
  const detail = await asUser(t, "player").query(api.contests.get, { key: "live" });

  return detail.problems;
}

describe("the sample download", () => {
  it("is offered for a statement that shows a sample", async () => {
    const t = setupTest();
    await seed(t, [WITH_SAMPLES, WITHOUT_SAMPLES]);

    const problems = await problemsFor(t);

    expect(problems.map((row) => row.hasSamples)).toEqual([true, false]);
  });

  it("reads the headings out of raw HTML too, which imported statements use", async () => {
    const t = setupTest();
    await seed(t, ["<h3>Input</h3><pre>1 2</pre><h3>Output</h3><pre>3</pre>"]);

    const problems = await problemsFor(t);

    expect(problems[0]?.hasSamples).toBe(true);
  });
});

describe("what a capped problem has left", () => {
  it("is null while the contest sets no cap", async () => {
    const t = setupTest();
    await seed(t, [WITH_SAMPLES]);

    const problems = await problemsFor(t);

    expect(problems[0]?.submissionsLeft).toBeNull();
  });

  it("counts the run's own submissions against the cap", async () => {
    const t = setupTest();
    const contestId = await insertContest(t, { key: "live", startTime: Date.now() - HOUR });
    const playerId = await insertProfile(t, { username: "player" });
    const problemId = await insertProblem(t, { code: "p0" });
    const languageId = await insertLanguage(t, { key: "PY3" });

    await insertContestProblem(t, { contestId, problemId, order: 0, points: 100, maxSubmissions: 3 });
    const participationId = await insertParticipation(t, { contestId, profileId: playerId });
    await t.run(async (ctx) => ctx.db.patch(playerId, { currentParticipationId: participationId }));

    await insertSubmission(t, { profileId: playerId, problemId, languageId, contestId, participationId });

    expect((await problemsFor(t))[0]?.submissionsLeft).toBe(2);
  });

  it("does not count a run the viewer is no longer in", async () => {
    const t = setupTest();
    const contestId = await insertContest(t, { key: "live", startTime: Date.now() - HOUR });
    const playerId = await insertProfile(t, { username: "player" });
    const problemId = await insertProblem(t, { code: "p0" });
    const languageId = await insertLanguage(t, { key: "PY3" });

    await insertContestProblem(t, { contestId, problemId, order: 0, points: 100, maxSubmissions: 3 });

    const earlier = await insertParticipation(t, { contestId, profileId: playerId, virtual: 1 });

    await insertSubmission(t, {
      profileId: playerId,
      problemId,
      languageId,
      contestId,
      participationId: earlier,
    });

    const current = await insertParticipation(t, { contestId, profileId: playerId, virtual: 2 });
    await t.run(async (ctx) => ctx.db.patch(playerId, { currentParticipationId: current }));

    expect((await problemsFor(t))[0]?.submissionsLeft).toBe(3);
  });
});
