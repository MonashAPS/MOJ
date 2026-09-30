// @vitest-environment edge-runtime
/**
 * The home sidebar's contests. The query never reads the clock itself: it is
 * handed a time rounded to the hour and returns what had not ended by then, so
 * the page, not a cached query, decides what is ongoing.
 */

import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { HOUR, insertContest } from "./test.fixtures";
import { setupTest } from "./test.setup";

describe("contests.homeSidebar", () => {
  it("lists visible open contests that had not ended, earliest start first", async () => {
    const t = setupTest();
    const now = Date.now();

    await insertContest(t, { key: "later", startTime: now + 5 * HOUR, endTime: now + 8 * HOUR });
    await insertContest(t, { key: "running", startTime: now - HOUR, endTime: now + HOUR });
    await insertContest(t, { key: "finished", startTime: now - 5 * HOUR, endTime: now - 2 * HOUR });
    await insertContest(t, {
      key: "hidden",
      isVisible: false,
      startTime: now - HOUR,
      endTime: now + HOUR,
    });
    await insertContest(t, {
      key: "invited",
      entry: { kind: "restricted", match: "all", organizationIds: [], classIds: [], profileIds: [] },
      startTime: now - HOUR,
      endTime: now + HOUR,
    });

    const rows = await t.query(api.contests.homeSidebar, { now });
    expect(rows.map((row) => row.key)).toEqual(["running", "later"]);
  });

  it("keeps a contest that ended after the rounded time, for the page to drop", async () => {
    const t = setupTest();
    const hour = Math.floor(Date.now() / HOUR) * HOUR;
    await insertContest(t, { key: "justended", startTime: hour - HOUR, endTime: hour + 1 });

    const rows = await t.query(api.contests.homeSidebar, { now: hour });
    expect(rows.map((row) => row.key)).toEqual(["justended"]);
  });
});
