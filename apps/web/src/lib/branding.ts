export type BrandingValues = {
  logoUrl: string | null;
  accentColor: string;
  accentColorDark: string;
  navColor: string;
  titlebarColor: string;
  titlebarColorDark: string;
  customCss: string;
  isCustomised: boolean;
};

/** Only the characters a CSS value may hold; a colour is validated in Convex,
 *  and a storage URL never contains one of these, but the shell escapes them
 *  anyway rather than trusting a stored string. */
function safeValue(value: string): string {
  return value.replace(/[<>"'`\\{}();]/g, "");
}

/**
 * SPEC section 24: the operator's colours and logo are emitted as overrides on
 * `:root` so `packages/ui/src/tokens.css` stays the single source of the
 * defaults. Custom CSS is appended last, after the overrides, so it wins.
 *
 * The dark derivatives are computed in `site.branding`, not here, so the same
 * pair reaches the server render and any client that reads them.
 */
export function brandingCss(branding: BrandingValues | null): string | null {
  if (!branding || (!branding.isCustomised && !branding.customCss)) return null;

  const accent = safeValue(branding.accentColor);
  const accentDark = safeValue(branding.accentColorDark);
  const nav = safeValue(branding.navColor);
  const titlebar = safeValue(branding.titlebarColor);
  const titlebarDark = safeValue(branding.titlebarColorDark);
  const logo = branding.logoUrl ? safeValue(branding.logoUrl) : null;

  const css = [
    `:root{--accent:${accent};--nav:${nav};--titlebar:${titlebar};--brand-royal:${accent};}`,
    `@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--accent:${accentDark};--nav:${nav};--titlebar:${titlebarDark};--brand-royal:${accentDark};}}`,
    `:root[data-theme="dark"]{--accent:${accentDark};--nav:${nav};--titlebar:${titlebarDark};--brand-royal:${accentDark};}`,
    // The nav takes the uploaded wordmark through its own `src`; the auth pages
    // draw the bundled SVG from a client component that cannot read the
    // branding, so it is replaced here until that component takes a prop.
    logo ? `svg[aria-label="MAPS Online Judge"]{content:url("${logo}");}` : "",
    branding.customCss ? `\n${branding.customCss}` : "",
  ].join("");

  return css;
}
