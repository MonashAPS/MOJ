// @vitest-environment edge-runtime
/**
 * `submissions.list` pages over its own scan, so every row has to be reachable.
 *
 * The page it returns is the scan minus the rows the viewer may not see;
 * `continueCursor` describes the end of that scan, so a page cut short at
 * `numItems` would strand the rows between the cut and the cursor.
 */

import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { insertLanguage, insertProblem, insertProfile, insertSubmission } from "./test.fixtures";
import { setupTest } from "./test.setup";

describe("submissions.list paging", () => {
  it("reaches every submission across pages", async () => {
    const t = setupTest();
    const languageId = await insertLanguage(t, { key: "PY3" });
    const problemId = await insertProblem(t, { code: "aplusb", allowedLanguageIds: [languageId] });
    const authorId = await insertProfile(t, { username: "author" });

    const total = 25;

    for (let index = 0; index < total; index += 1) {
      await insertSubmission(t, {
        profileId: authorId,
        problemId,
        languageId,
        status: "D",
        result: "AC",
        date: 1_700_000_000_000 + index,
        legacyId: 1000 + index,
      });
    }

    const seen = new Set<number>();
    let cursor: string | null = null;

    for (let guard = 0; guard < 20; guard += 1) {
      const page: {
        page: Array<{ id: number | string }>;
        isDone: boolean;
        continueCursor: string;
      } = await t.query(api.submissions.list, {
        paginationOpts: { numItems: 5, cursor },
        problemCode: "aplusb",
      });

      for (const row of page.page) seen.add(Number(row.id));

      if (page.isDone) break;
      cursor = page.continueCursor;
    }

    expect(seen.size).toBe(total);
  });

  it("keeps a filtered page reachable too", async () => {
    const t = setupTest();
    const languageId = await insertLanguage(t, { key: "PY3" });
    const problemId = await insertProblem(t, { code: "aplusb", allowedLanguageIds: [languageId] });
    const authorId = await insertProfile(t, { username: "author" });

    // Every fourth submission is a WA; the rest are filtered out of the page.
    for (let index = 0; index < 24; index += 1) {
      await insertSubmission(t, {
        profileId: authorId,
        problemId,
        languageId,
        status: "D",
        result: index % 4 === 0 ? "WA" : "AC",
        date: 1_700_000_000_000 + index,
        legacyId: 2000 + index,
      });
    }

    const seen = new Set<number>();
    let cursor: string | null = null;

    for (let guard = 0; guard < 30; guard += 1) {
      const page: {
        page: Array<{ id: number | string }>;
        isDone: boolean;
        continueCursor: string;
      } = await t.query(api.submissions.list, {
        paginationOpts: { numItems: 3, cursor },
        problemCode: "aplusb",
        results: ["WA"],
      });

      for (const row of page.page) seen.add(Number(row.id));

      if (page.isDone) break;
      cursor = page.continueCursor;
    }

    expect(seen.size).toBe(6);
  });
});
