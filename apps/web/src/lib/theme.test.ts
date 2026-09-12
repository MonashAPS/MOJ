import { describe, expect, it } from "vitest";
import { type ThemeDefault, themeBootstrap } from "./theme";

/** Runs the inline bootstrap the way a browser would, against a stand-in root
 *  element and a stand-in store, and reports the attribute it left behind. */
function run(
  stored: string | null,
  defaultTheme: ThemeDefault,
  { alreadyOn }: { alreadyOn?: string } = {},
): string | null {
  let attribute: string | null = alreadyOn ?? null;
  const documentElement = {
    setAttribute: (_name: string, value: string) => {
      attribute = value;
    },
    removeAttribute: () => {
      attribute = null;
    },
  };
  new Function("document", "localStorage", themeBootstrap(defaultTheme))(
    { documentElement },
    { getItem: () => stored },
  );
  return attribute;
}

describe("themeBootstrap", () => {
  it("honours a stored light or dark choice", () => {
    expect(run("light", "dark")).toBe("light");
    expect(run("dark", "light")).toBe("dark");
  });

  it("leaves the attribute off when the viewer follows the system", () => {
    expect(run("system", "dark")).toBeNull();
  });

  it("clears an attribute a replayed page arrived with", () => {
    // A cached copy of the page can carry the previous theme in its markup, and
    // the viewer's stored choice has to win over it either way.
    expect(run("system", "dark", { alreadyOn: "dark" })).toBeNull();
    expect(run("light", "dark", { alreadyOn: "dark" })).toBe("light");
  });

  it("falls back to the operator's default only when nothing is stored", () => {
    expect(run(null, "dark")).toBe("dark");
    expect(run(null, "light")).toBe("light");
    expect(run(null, "system")).toBeNull();
  });

  it("ignores a value it does not recognise", () => {
    expect(run("purple", "dark")).toBe("dark");
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
});
