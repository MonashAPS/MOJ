// @vitest-environment edge-runtime

/**
 * The language a submit form opens on.
 *
 * Every submit surface wants this one fact about the viewer, and the pages used
 * to fetch the whole languages table to work it out for themselves.
 */

import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { asUser, insertLanguage, insertProfile } from "./test.fixtures";
import { setupTest } from "./test.setup";

describe("languages.viewerDefault", () => {
  it("names the language the member chose", async () => {
    const t = setupTest();
    const languageId = await insertLanguage(t, { key: "CPP20", name: "C++20" });
    await insertProfile(t, { username: "player", languageId });

    expect(await asUser(t, "player").query(api.languages.viewerDefault, {})).toEqual({ key: "CPP20" });
  });

  it("names none for a member who chose none", async () => {
    const t = setupTest();
    await insertProfile(t, { username: "player" });

    expect(await asUser(t, "player").query(api.languages.viewerDefault, {})).toBeNull();
  });

  it("names none for a visitor", async () => {
    const t = setupTest();

    expect(await t.query(api.languages.viewerDefault, {})).toBeNull();
  });
});
