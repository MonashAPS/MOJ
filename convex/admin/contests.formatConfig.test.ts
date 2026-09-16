// @vitest-environment edge-runtime

/**
 * Saving a contest from `/admin`.
 *
 * `formatConfig` is required by the schema and holds null for a format that
 * takes no configuration, which is what `create` writes. The editor sends that
 * null straight back on every save, and the patch builder read it as "clear
 * this field" — so saving any contest on the default format removed a field the
 * schema requires and the write was refused.
 */

import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import { asUser, insertContest, insertProfile } from "../test.fixtures";
import { setupTest } from "../test.setup";

async function seed() {
  const t = setupTest();
  await t.run(async (ctx) => {
    await insertProfile(ctx, { username: "root", isStaff: true, isSuperuser: true });
  });
  await insertContest(t, { key: "divb", name: "MCPC 2026 Division B" });

  return t;
}

describe("editing a contest whose format takes no configuration", () => {
  test("saves, with the null kept as the value", async () => {
    const t = await seed();

    await asUser(t, "root").mutation(api.admin.contests.update, {
      key: "divb",
      name: "MCPC 2026 Division B",
      formatName: "default",
      formatConfig: null,
    });

    const contest = await t.run(async (ctx) =>
      ctx.db
        .query("contests")
        .withIndex("by_key", (q) => q.eq("key", "divb"))
        .unique(),
    );

    expect(contest?.name).toBe("MCPC 2026 Division B");
    expect(contest?.formatConfig).toBeNull();
    // Present, not absent: absent is what the schema refused.
    expect(contest !== null && "formatConfig" in contest).toBe(true);
  });

  test("still clears a field where null does mean clear", async () => {
    const t = await seed();

    await asUser(t, "root").mutation(api.admin.contests.update, {
      key: "divb",
      accessCode: "hunter2",
    });

    await asUser(t, "root").mutation(api.admin.contests.update, {
      key: "divb",
      accessCode: null,
    });

    const contest = await t.run(async (ctx) =>
      ctx.db
        .query("contests")
        .withIndex("by_key", (q) => q.eq("key", "divb"))
        .unique(),
    );

    expect(contest?.accessCode).toBeUndefined();
  });
});
