import { describe, expect, it } from "vitest";
import { type AudienceMembership, artefactIsVisible } from "./artefacts";

const NOBODY: AudienceMembership = {
  staff: false,
  testers: false,
  spectators: false,
  contestants: false,
  everyone: false,
};

describe("who may download a file", () => {
  it("lets staff at everything, listed or not, ended or not", () => {
    const staff = { ...NOBODY, staff: true };

    expect(artefactIsVisible({ audiences: [], from: "end" }, staff, false)).toBe(true);
  });

  it("admits a viewer in any listed audience", () => {
    const tester = { ...NOBODY, testers: true, everyone: true };

    expect(artefactIsVisible({ audiences: ["testers"], from: "now" }, tester, false)).toBe(true);
    expect(artefactIsVisible({ audiences: ["contestants"], from: "now" }, tester, false)).toBe(false);
    expect(artefactIsVisible({ audiences: [], from: "now" }, tester, false)).toBe(false);
  });

  it("holds a file for afterwards until the contest has ended", () => {
    const contestant = { ...NOBODY, contestants: true, everyone: true };
    const file = { audiences: ["everyone" as const], from: "end" as const };

    expect(artefactIsVisible(file, contestant, false)).toBe(false);
    expect(artefactIsVisible(file, contestant, true)).toBe(true);
  });
});
