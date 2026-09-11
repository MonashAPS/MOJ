import { describe, expect, test } from "vitest";
import { type BrandingValues, brandingCss } from "./branding";

/** What `site.branding` answers for an instance nobody has branded: the
 *  design system's own values, and nothing marked as an override. */
const DEFAULTS: BrandingValues = {
  logoUrl: null,
  accentColor: "#2941a5",
  accentColorDark: "#7c96db",
  accentFillDark: "#314cb1",
  accentFillHoverDark: "#3e5bc1",
  accentFillActiveDark: "#263ca0",
  navColor: "#101a3d",
  navColorDark: "#152148",
  titlebarColor: "#101a3d",
  titlebarColorDark: "#263563",
  contestBarColor: "#17234b",
  contestBarColorDark: "#1e2b55",
  customCss: "",
  colorsCustomised: false,
  isCustomised: false,
};

const BRANDED: BrandingValues = {
  ...DEFAULTS,
  accentColor: "#b3001b",
  accentColorDark: "#f18a82",
  accentFillDark: "#bf1b26",
  accentFillHoverDark: "#d13235",
  accentFillActiveDark: "#ac0019",
  navColor: "#1a1a2e",
  navColorDark: "#212137",
  titlebarColor: "#1a1a2e",
  titlebarColorDark: "#34344f",
  contestBarColor: "#23233a",
  contestBarColorDark: "#2a2a43",
  colorsCustomised: true,
  isCustomised: true,
};

describe("brandingCss", () => {
  test("an unbranded instance emits nothing, so the token file stands alone", () => {
    expect(brandingCss(DEFAULTS)).toBeNull();
    expect(brandingCss(null)).toBeNull();
  });

  test("colours saved at the defaults are not an override and emit nothing", () => {
    // Saving the branding form unchanged stores the values it offered; that is
    // not a choice, and it must not start overriding the token file.
    expect(brandingCss({ ...DEFAULTS, isCustomised: true, colorsCustomised: false })).toBeNull();
  });

  test("a logo on an otherwise default instance emits the logo and no colours", () => {
    const css = brandingCss({ ...DEFAULTS, isCustomised: true, logoUrl: "https://example.com/logo.svg" });
    expect(css).not.toBeNull();
    expect(css).toContain('svg[aria-label="MAPS Online Judge"]{content:url("https://example.com/logo.svg")');
    expect(css).not.toContain("--accent");
    expect(css).not.toContain("--nav:");
  });

  test("the overrides land on :root and on both dark selectors", () => {
    const css = brandingCss(BRANDED) as string;
    expect(css).toContain(":root{--accent:#b3001b");
    expect(css).toContain('@media (prefers-color-scheme: dark){:root:not([data-theme="light"])');
    expect(css).toContain(':root[data-theme="dark"],.theme-dark{--accent:#f18a82');
  });

  test("the dark chrome is its own set of values, not the light ones repeated", () => {
    const css = brandingCss(BRANDED) as string;
    const dark = css.slice(css.indexOf("@media"));
    expect(dark).toContain("--nav:#212137");
    expect(dark).toContain("--titlebar:#34344f");
    expect(dark).toContain("--contest-bar:#2a2a43");
    expect(dark).not.toContain("--nav:#1a1a2e");
  });

  test("the filled primary follows the brand on dark, not the token royal", () => {
    const css = brandingCss(BRANDED) as string;
    const dark = css.slice(css.indexOf("@media"));
    expect(dark).toContain("--accent-fill:#bf1b26");
    expect(dark).toContain("--accent-fill-hover:#d13235");
    expect(dark).toContain("--accent-fill-active:#ac0019");
    // Light has no fill of its own; the accent is the fill there.
    expect(css.slice(0, css.indexOf("@media"))).not.toContain("--accent-fill");
  });

  test("the nav colour drives the band and the bar under it", () => {
    const css = brandingCss(BRANDED) as string;
    expect(css).toContain(":root{--accent:#b3001b;--nav:#1a1a2e;--titlebar:#1a1a2e;--contest-bar:#23233a");
  });

  test("the royal follows the accent, so the keyline and the focus ring match it", () => {
    const css = brandingCss(BRANDED) as string;
    expect(css).toContain(":root{--accent:#b3001b");
    expect(css.slice(0, css.indexOf("}"))).toContain("--brand-royal:#b3001b");
    expect(css.slice(css.indexOf("@media"))).toContain("--brand-royal:#f18a82");
  });

  test("custom CSS is appended after the overrides in both modes, so it wins", () => {
    const css = brandingCss({ ...BRANDED, customCss: ":root { --radius: 2px; }" }) as string;
    expect(css.indexOf("--radius")).toBeGreaterThan(css.indexOf("--accent"));
    expect(css.indexOf("--radius")).toBeGreaterThan(css.indexOf("@media"));
    expect(css.indexOf("--radius")).toBeGreaterThan(css.indexOf('[data-theme="dark"]'));
  });

  test("custom CSS alone is enough to emit, with no colour overrides", () => {
    const css = brandingCss({ ...DEFAULTS, isCustomised: true, customCss: ":root { --radius: 2px; }" });
    expect(css).toBe("\n:root { --radius: 2px; }");
  });

  test("a stored value cannot close the style element or start a new rule", () => {
    const css = brandingCss({
      ...BRANDED,
      accentColor: '#fff"} body{display:none}<script>',
    });
    expect(css).not.toContain("<script>");
    expect(css).not.toContain("body{display:none}");
  });
});
