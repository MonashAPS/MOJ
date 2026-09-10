import { describe, expect, test } from "vitest";
import { type BrandingValues, brandingCss } from "./branding";

const DEFAULTS: BrandingValues = {
  logoUrl: null,
  accentColor: "#2941a5",
  accentColorDark: "#8997ce",
  navColor: "#101a3d",
  titlebarColor: "#101a3d",
  titlebarColorDark: "#26304b",
  customCss: "",
  isCustomised: false,
};

describe("brandingCss", () => {
  test("an unbranded instance emits nothing, so the token file stands alone", () => {
    expect(brandingCss(DEFAULTS)).toBeNull();
    expect(brandingCss(null)).toBeNull();
  });

  test("the overrides land on :root and on both dark selectors", () => {
    const css = brandingCss({
      ...DEFAULTS,
      accentColor: "#b3001b",
      accentColorDark: "#e08c99",
      isCustomised: true,
    });
    expect(css).toContain(":root{--accent:#b3001b");
    expect(css).toContain('@media (prefers-color-scheme: dark){:root:not([data-theme="light"])');
    expect(css).toContain(':root[data-theme="dark"]{--accent:#e08c99');
    // The nav colour drives the titlebar band as well as the bar itself.
    expect(css).toContain("--titlebar:#101a3d");
  });

  test("custom CSS is appended after the overrides so it wins", () => {
    const css = brandingCss({ ...DEFAULTS, customCss: ":root { --radius: 2px; }" });
    expect(css).not.toBeNull();
    expect((css as string).indexOf("--radius")).toBeGreaterThan((css as string).indexOf("--accent"));
  });

  test("a stored value cannot close the style element or start a new rule", () => {
    const css = brandingCss({
      ...DEFAULTS,
      isCustomised: true,
      accentColor: '#fff"} body{display:none}<script>',
    });
    expect(css).not.toContain("<script>");
    expect(css).not.toContain("body{display:none}");
  });

  test("an uploaded wordmark replaces the bundled one on the auth pages", () => {
    const css = brandingCss({ ...DEFAULTS, isCustomised: true, logoUrl: "https://example.com/logo.svg" });
    expect(css).toContain('svg[aria-label="MAPS Online Judge"]{content:url("https://example.com/logo.svg")');
  });
});
