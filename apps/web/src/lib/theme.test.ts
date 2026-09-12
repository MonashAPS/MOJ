import { describe, expect, it } from "vitest";
import { resolveTheme, type ThemeDefault, themeBootstrap } from "./theme";

/** Runs the inline bootstrap the way a browser would, against a stand-in root
 *  element and a stand-in store, and reports what it left behind. */
function run(
  stored: string | null,
  defaultTheme: ThemeDefault,
  { alreadyOn }: { alreadyOn?: string } = {},
): { attribute: string | null; cookie: string } {
  let attribute: string | null = alreadyOn ?? null;
  let cookie = "";
  const documentElement = {
    setAttribute: (_name: string, value: string) => {
      attribute = value;
    },
    removeAttribute: () => {
      attribute = null;
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
  new Function("document", "localStorage", themeBootstrap(defaultTheme))(document, {
    getItem: () => stored,
  });
  return { attribute, cookie };
}

/** The attribute alone, for the cases that are only about the attribute. */
const attr = (...args: Parameters<typeof run>) => run(...args).attribute;

describe("themeBootstrap", () => {
  it("honours a stored light or dark choice", () => {
    expect(attr("light", "dark")).toBe("light");
    expect(attr("dark", "light")).toBe("dark");
  });

  it("leaves the attribute off when the viewer follows the system", () => {
    expect(attr("system", "dark")).toBeNull();
  });

  it("clears an attribute a replayed page arrived with", () => {
    // A cached copy of the page can carry the previous theme in its markup, and
    // the viewer's stored choice has to win over it either way.
    expect(attr("system", "dark", { alreadyOn: "dark" })).toBeNull();
    expect(attr("light", "dark", { alreadyOn: "dark" })).toBe("light");
  });

  it("falls back to the operator's default only when nothing is stored", () => {
    expect(attr(null, "dark")).toBe("dark");
    expect(attr(null, "light")).toBe("light");
    expect(attr(null, "system")).toBeNull();
  });

  it("ignores a value it does not recognise", () => {
    expect(attr("purple", "dark")).toBe("dark");
  });

  it("survives a store that refuses to be read", () => {
    const documentElement = {
      setAttribute: () => {
        throw new Error("should not be reached");
      },
      removeAttribute: () => undefined,
    };
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() =>
      new Function("document", "localStorage", themeBootstrap("light"))({ documentElement }, blocked),
    ).not.toThrow();
  });

  it("mirrors a stored choice into the cookie the server reads", () => {
    // A choice made before the cookie existed has to migrate on its own, or the
    // server keeps rendering the default for that viewer forever.
    expect(run("light", "dark").cookie).toContain("moj-theme=light");
    expect(run("system", "dark").cookie).toContain("moj-theme=system");
  });

  it("writes no cookie for a viewer who has never chosen", () => {
    expect(run(null, "dark").cookie).toBe("");
  });
});

describe("resolveTheme", () => {
  it("takes the viewer's choice over the operator's default", () => {
    expect(resolveTheme("light", "dark")).toBe("light");
    expect(resolveTheme("dark", "light")).toBe("dark");
  });

  it("returns nothing when the viewer follows the system", () => {
    expect(resolveTheme("system", "dark")).toBeNull();
  });

  it("falls back to the default when the cookie is absent or junk", () => {
    expect(resolveTheme(undefined, "dark")).toBe("dark");
    expect(resolveTheme("purple", "light")).toBe("light");
    expect(resolveTheme(undefined, "system")).toBeNull();
  });
});
