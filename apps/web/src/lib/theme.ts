/** Where the viewer's theme choice lives in the browser. ThemeToggle writes it,
 *  the pre-paint bootstrap below reads it. */
export const THEME_STORAGE_KEY = "moj-theme";

/** Following the system is stored under this value rather than as a missing key.
 *  An empty slot has to keep meaning "has never chosen", because that is the one
 *  case where the profile's own theme may be imposed. */
export const THEME_SYSTEM = "system";

export type ThemeDefault = "system" | "light" | "dark";

/**
 * The script that runs before first paint so a dark-mode viewer never sees a
 * white flash. A viewer with nothing stored gets the operator's default (SPEC
 * section 24); "system", whether chosen or fallen back to, leaves the attribute
 * off and lets `prefers-color-scheme` decide, as before.
 *
 * The attribute is cleared rather than left alone, because a page the browser
 * replays from its cache can arrive with a stale one already on it.
 */
export function themeBootstrap(defaultTheme: ThemeDefault): string {
  return `(function(){try{var r=document.documentElement;var t=localStorage.getItem(${JSON.stringify(
    THEME_STORAGE_KEY,
  )});if(t!=="dark"&&t!=="light"&&t!==${JSON.stringify(THEME_SYSTEM)}){t=${JSON.stringify(
    defaultTheme,
  )};}if(t==="dark"||t==="light"){r.setAttribute("data-theme",t);}else{r.removeAttribute("data-theme");}}catch(e){}})();`;
}
