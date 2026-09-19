import { describe, expect, it } from "vitest";
import { type AudienceMembership, policyAdmits, policyIsPublic } from "./audiences";

const NOBODY: AudienceMembership = {
  staff: false,
  testers: false,
  spectators: false,
  contestants: false,
  everyone: false,
};

const RUNNING = { ended: false, ownEnded: false };

describe("a policy", () => {
  it("admits staff whatever it says", () => {
    expect(policyAdmits({ audiences: [], from: "end" }, { ...NOBODY, staff: true }, RUNNING)).toBe(true);
  });

  it("admits a viewer in any listed audience, and nobody else", () => {
    const tester = { ...NOBODY, testers: true, everyone: true };

    expect(policyAdmits({ audiences: ["testers"], from: "start" }, tester, RUNNING)).toBe(true);
    expect(policyAdmits({ audiences: ["contestants"], from: "start" }, tester, RUNNING)).toBe(false);
    expect(policyAdmits({ audiences: [], from: "start" }, tester, RUNNING)).toBe(false);
  });

  it("waits for the viewer's own window, or for the end, when told to", () => {
    const contestant = { ...NOBODY, contestants: true, everyone: true };
    const ownEnd = { audiences: ["everyone" as const], from: "ownEnd" as const };
    const end = { audiences: ["everyone" as const], from: "end" as const };

    expect(policyAdmits(ownEnd, contestant, RUNNING)).toBe(false);
    expect(policyAdmits(ownEnd, contestant, { ended: false, ownEnded: true })).toBe(true);
    expect(policyAdmits(end, contestant, { ended: false, ownEnded: true })).toBe(false);
    expect(policyAdmits(end, contestant, { ended: true, ownEnded: true })).toBe(true);
  });

  it("is public exactly when a stranger would be let in now", () => {
    expect(policyIsPublic({ audiences: ["everyone"], from: "start" }, false)).toBe(true);
    expect(policyIsPublic({ audiences: ["everyone"], from: "end" }, false)).toBe(false);
    expect(policyIsPublic({ audiences: ["everyone"], from: "ownEnd" }, true)).toBe(true);
    expect(policyIsPublic({ audiences: ["contestants"], from: "start" }, true)).toBe(false);
  });
});
