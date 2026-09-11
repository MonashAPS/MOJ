export type BrandingValues = {
  logoUrl: string | null;
  accentColor: string;
  accentColorDark: string;
  navColor: string;
  navColorDark: string;
  titlebarColor: string;
  titlebarColorDark: string;
  contestBarColor: string;
  contestBarColorDark: string;
  customCss: string;
  colorsCustomised: boolean;
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
 * defaults. Each part is emitted only when there is something to say — colours
 * the operator actually chose, a logo they actually uploaded — so an instance
 * that has merely saved the branding form leaves the token file alone. Custom
 * CSS goes last, after the light and the dark overrides both, so it wins.
 *
 * The dark derivatives are computed in `site.branding`, not here, so the same
 * palette reaches the server render and any client that reads it.
 */
export function brandingCss(branding: BrandingValues | null): string | null {
  if (!branding) return null;

  const blocks: string[] = [];

  if (branding.colorsCustomised) {
    const vars = (accent: string, nav: string, titlebar: string, contestBar: string) =>
      [
        `--accent:${safeValue(accent)}`,
        `--nav:${safeValue(nav)}`,
        `--titlebar:${safeValue(titlebar)}`,
        `--contest-bar:${safeValue(contestBar)}`,
        `--brand-royal:${safeValue(accent)}`,
      ].join(";");
    const light = vars(
      branding.accentColor,
      branding.navColor,
      branding.titlebarColor,
      branding.contestBarColor,
    );
    // The dark chrome is its own set of values, derived from the operator's the
    // way tokens.css derives its dark chrome from its light chrome. `.theme-dark`
    // comes with the explicit selector so the hall scoreboard, which is dark
    // whatever the viewer's theme is, is branded too.
    const dark = vars(
      branding.accentColorDark,
      branding.navColorDark,
      branding.titlebarColorDark,
      branding.contestBarColorDark,
    );
    blocks.push(
      `:root{${light};}`,
      `@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${dark};}}`,
      `:root[data-theme="dark"],.theme-dark{${dark};}`,
    );
  }

  // The nav takes the uploaded wordmark through its own `src`; the auth pages
  // draw the bundled SVG from a client component that cannot read the branding,
  // so it is replaced here until that component takes a prop.
  if (branding.logoUrl) {
    blocks.push(`svg[aria-label="MAPS Online Judge"]{content:url("${safeValue(branding.logoUrl)}");}`);
  }

  if (branding.customCss) blocks.push(`\n${branding.customCss}`);

  return blocks.length === 0 ? null : blocks.join("");
}
