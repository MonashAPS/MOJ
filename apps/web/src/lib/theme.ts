/** Where the viewer's theme choice lives in the browser. ThemeToggle writes it,
 *  the pre-paint bootstrap below reads it. */
export const THEME_STORAGE_KEY = "moj-theme";

/** The same choice, mirrored into a cookie so the server can put `data-theme` on
 *  `<html>` itself. The markup then carries the theme whether or not the
 *  bootstrap script below ever runs, which is what keeps a hard refresh honest
 *  for a viewer whose browser declines to run inline scripts. */
export const THEME_COOKIE = "moj-theme";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Following the system is stored under this value rather than as a missing key.
 *  An empty slot has to keep meaning "has never chosen", because that is the one
 *  case where the profile's own theme may be imposed. */
export const THEME_SYSTEM = "system";

export type ThemeDefault = "system" | "light" | "dark";

/** The attribute `<html>` should carry, or null to let `prefers-color-scheme`
 *  decide. Takes the viewer's stored choice, then the operator's default. */
export function resolveTheme(
  stored: string | undefined,
  defaultTheme: ThemeDefault,
): "light" | "dark" | null {
  const value = stored === "dark" || stored === "light" || stored === THEME_SYSTEM ? stored : defaultTheme;
  return value === "dark" || value === "light" ? value : null;
}

/**
 * The script that runs before first paint, for the one case the server cannot
 * cover: a viewer whose choice predates the cookie, or who has just made one in
 * another tab. A viewer with nothing stored gets the operator's default (SPEC
 * section 24); "system", whether chosen or fallen back to, leaves the attribute
 * off and lets `prefers-color-scheme` decide, as before.
 *
 * It writes the cookie back, so a choice made before this existed is picked up
 * on the next load and served in the markup from then on. The attribute is
 * cleared rather than left alone, because a page the browser replays from its
 * cache can arrive with a stale one already on it.
 */
export function themeBootstrap(defaultTheme: ThemeDefault): string {
  const key = JSON.stringify(THEME_STORAGE_KEY);
  const cookie = JSON.stringify(THEME_COOKIE);
  const fallback = JSON.stringify(defaultTheme);
  const system = JSON.stringify(THEME_SYSTEM);
  return `(function(){try{var r=document.documentElement;var t=localStorage.getItem(${key});if(t!=="dark"&&t!=="light"&&t!==${system}){t=${fallback};}else{document.cookie=${cookie}+"="+t+";path=/;max-age=${COOKIE_MAX_AGE};samesite=lax";}if(t==="dark"||t==="light"){r.setAttribute("data-theme",t);}else{r.removeAttribute("data-theme");}}catch(e){}})();`;
}

/** Writes the cookie the server reads. Mirrors what the bootstrap does, for the
 *  moment the viewer actually picks a theme. */
export function writeThemeCookie(value: string) {
  // biome-ignore lint/suspicious/noDocumentCookie: the Cookie Store API it would rather have is not in Firefox
  document.cookie = `${THEME_COOKIE}=${value};path=/;max-age=${COOKIE_MAX_AGE};samesite=lax`;
}
