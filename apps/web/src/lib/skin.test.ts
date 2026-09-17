import { describe, expect, it } from "vitest";
import {
  DEFAULT_SKIN,
  resolveSkin,
  type Skin,
  skinBootstrap,
  skinFamily,
  usesDomjudgeStructure,
} from "./skin";

type BootstrapTrace = { attribute: string | null; cookie: string };

/** Runs the inline bootstrap the way a browser would, against a stand-in root
 *  element and a stand-in store, and reports what it left behind. */
function run(stored: string | null, fallback: Skin = DEFAULT_SKIN): BootstrapTrace {
  let attribute: string | null = null;
  let cookie = "";

  const documentElement = {
    setAttribute: (_name: string, value: string) => {
      attribute = value;
    },
  };

  const document = {
    documentElement,
    set cookie(value: string) {
      cookie = value;
    },
    get cookie() {
      return cookie;
    },
  };

  new Function("document", "localStorage", skinBootstrap(fallback))(document, { getItem: () => stored });

  return { attribute, cookie };
}

describe("resolveSkin", () => {
  it("takes the cookie when it names a skin we ship", () => {
    expect(resolveSkin("domjudge")).toBe("domjudge");
    expect(resolveSkin("maps")).toBe("maps");
  });

  it("falls back to the house skin for anything else", () => {
    expect(resolveSkin(undefined)).toBe(DEFAULT_SKIN);
    expect(resolveSkin("")).toBe(DEFAULT_SKIN);
    expect(resolveSkin("bootstrap")).toBe(DEFAULT_SKIN);
  });
});

describe("the DOMjudge variants", () => {
  it("are one family, so the card stays lit while the variant changes", () => {
    expect(skinFamily("domjudge")).toBe("domjudge");
    expect(skinFamily("domjudge-structure")).toBe("domjudge");
    expect(skinFamily("maps")).toBe("maps");
  });

  it("only rebuild the pages when the structure one is chosen", () => {
    expect(usesDomjudgeStructure("domjudge")).toBe(false);
    expect(usesDomjudgeStructure("domjudge-structure")).toBe(true);
    expect(usesDomjudgeStructure("maps")).toBe(false);
  });

  it("are both stored and read back", () => {
    expect(resolveSkin("domjudge-structure")).toBe("domjudge-structure");
  });
});

describe("skinBootstrap", () => {
  it("applies a stored choice", () => {
    expect(run("domjudge").attribute).toBe("domjudge");
    expect(run("domjudge-structure").attribute).toBe("domjudge-structure");
  });

  it("writes the cookie the server reads next time", () => {
    expect(run("domjudge").cookie).toContain("moj-skin=domjudge");
  });

  it("sets the house skin rather than leaving the attribute off", () => {
    // Unlike the theme, every skin is a value: nothing here means the house
    // skin, and the preview boxes in the menu need something to match against.
    expect(run(null).attribute).toBe("maps");
    expect(run("bootstrap").attribute).toBe("maps");
  });

  it("does not write a cookie for a choice that was never made", () => {
    expect(run(null).cookie).toBe("");
  });

  it("keeps the skin the page was rendered with when this browser knows none", () => {
    // The viewer chose DOMjudge on another machine; their profile carried it
    // into the markup, and the script must not undo that.
    expect(run(null, "domjudge").attribute).toBe("domjudge");
  });

  it("survives a store that refuses to be read", () => {
    const documentElement = {
      setAttribute: () => {
        throw new Error("should not be reached");
      },
    };

    const blocked = {
      getItem: () => {
        throw new Error("storage denied");
      },
    };

    expect(() => {
      new Function("document", "localStorage", skinBootstrap())({ documentElement }, blocked);
    }).not.toThrow();
  });
});
