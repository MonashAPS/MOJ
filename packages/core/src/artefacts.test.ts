import { describe, expect, it } from "vitest";
import { artefactIsVisible } from "./artefacts";

describe("who may download a file", () => {
  it("lets an editor at everything", () => {
    const editor = { canEdit: true, canView: true, ended: false };

    expect(artefactIsVisible("staff", editor)).toBe(true);
    expect(artefactIsVisible("afterEnd", editor)).toBe(true);
  });

  it("keeps a staff-only file from everyone else", () => {
    expect(artefactIsVisible("staff", { canEdit: false, canView: true, ended: true })).toBe(false);
  });

  it("shows a file for everyone only to people who can see its owner", () => {
    expect(artefactIsVisible("everyone", { canEdit: false, canView: true, ended: false })).toBe(true);
    expect(artefactIsVisible("everyone", { canEdit: false, canView: false, ended: true })).toBe(false);
  });

  it("holds a file for afterwards until the contest has ended", () => {
    expect(artefactIsVisible("afterEnd", { canEdit: false, canView: true, ended: false })).toBe(false);
    expect(artefactIsVisible("afterEnd", { canEdit: false, canView: true, ended: true })).toBe(true);
  });
});
