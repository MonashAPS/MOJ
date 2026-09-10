import { describe, expect, it } from "vitest";
import { identiconUrl, initials } from "./avatar";

describe("identiconUrl", () => {
  it("is a 32 character hex path so gravatar draws an identicon", () => {
    const url = new URL(identiconUrl("PenguinDevs"));
    expect(url.hostname).toBe("www.gravatar.com");
    expect(url.pathname).toMatch(/^\/avatar\/[0-9a-f]{32}$/);
  });

  it("forces the default image so it can never resolve to a real photograph", () => {
    expect(new URL(identiconUrl("someone")).searchParams.get("f")).toBe("y");
    expect(new URL(identiconUrl("someone")).searchParams.get("d")).toBe("identicon");
  });

  it("is stable per name and ignores case and surrounding space", () => {
    expect(identiconUrl("ski")).toBe(identiconUrl(" SKI "));
    expect(identiconUrl("ski")).not.toBe(identiconUrl("skj"));
  });

  it("carries the requested size", () => {
    expect(new URL(identiconUrl("ski", 48)).searchParams.get("s")).toBe("48");
  });
});

describe("initials", () => {
  it("takes two letters from a single word", () => {
    expect(initials("emertylover445")).toBe("EM");
  });

  it("takes the first and last word otherwise", () => {
    expect(initials("Jacob Nardella")).toBe("JN");
    expect(initials("a b c")).toBe("AC");
  });

  it("falls back rather than rendering nothing", () => {
    expect(initials("")).toBe("?");
    expect(initials("...")).toBe("?");
  });
});
