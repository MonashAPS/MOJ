// @vitest-environment edge-runtime

/**
 * Saving how the site looks.
 *
 * Light or dark and which skin are two separate controls that save separately,
 * so the mutation takes either on its own and must not treat the one it was not
 * given as a clearing.
 */

import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { asUser, insertProfile } from "./test.fixtures";
import { setupTest, type T } from "./test.setup";

async function profileOf(t: T, username: string) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("profiles")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique(),
  );
}

describe("profiles.setTheme", () => {
  it("saves a skin on its own", async () => {
    const t = setupTest();
    await insertProfile(t, { username: "player", siteTheme: "dark" });

    await asUser(t, "player").mutation(api.profiles.setTheme, { siteSkin: "domjudge" });

    const profile = await profileOf(t, "player");

    expect(profile?.siteSkin).toBe("domjudge");
    // The theme it was not asked about is the theme it had.
    expect(profile?.siteTheme).toBe("dark");
  });

  it("saves a theme without disturbing the skin", async () => {
    const t = setupTest();
    await insertProfile(t, { username: "player", siteSkin: "domjudge" });

    await asUser(t, "player").mutation(api.profiles.setTheme, { siteTheme: "light" });

    const profile = await profileOf(t, "player");

    expect(profile?.siteTheme).toBe("light");
    expect(profile?.siteSkin).toBe("domjudge");
  });

  it("says nothing happened for a visitor with no profile", async () => {
    const t = setupTest();

    expect(await t.mutation(api.profiles.setTheme, { siteSkin: "domjudge" })).toBeNull();
  });
});
