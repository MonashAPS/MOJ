/**
 * The skin: which design language the site is wearing, as opposed to whether it
 * is light or dark.
 *
 * `maps` is the house look; `domjudge` is the one people arriving from a DOMjudge
 * contest already know. It is stored and applied exactly the way the theme is —
 * localStorage for the browser, a cookie so the server can put the attribute in
 * the markup, and the profile for a viewer who logs in elsewhere — because a
 * skin that arrives a frame late is a skin that flashes the wrong site at you.
 */

export const SKIN_STORAGE_KEY = "moj-skin";

export const SKIN_COOKIE = "moj-skin";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const SKINS = ["maps", "domjudge"] as const;

export type Skin = (typeof SKINS)[number];

/** The house skin, for anyone who has never chosen. */
export const DEFAULT_SKIN: Skin = "maps";

function isSkin(value: string | undefined): value is Skin {
  return value === "maps" || value === "domjudge";
}

/** What `<html>` should carry. Unlike the theme there is no "follow the system"
 *  here: a skin is a choice or the house default. */
export function resolveSkin(stored: string | undefined): Skin {
  return isSkin(stored) ? stored : DEFAULT_SKIN;
}

/**
 * The script that runs before first paint, for the case the cookie cannot cover:
 * a choice made in another tab, or one made before the cookie was written.
 *
 * It writes the cookie back so the next load is served with the attribute in the
 * markup, and it always sets the attribute rather than clearing it, because
 * every skin including the house one is a value.
 *
 * `fallback` is what the server rendered the page with — the viewer's profile
 * skin, when this browser has never been told one — so a viewer who chose
 * DOMjudge on another machine does not watch this script take it away.
 */
export function skinBootstrap(fallback: Skin = DEFAULT_SKIN): string {
  const key = JSON.stringify(SKIN_STORAGE_KEY);
  const cookie = JSON.stringify(SKIN_COOKIE);
  const fallbackValue = JSON.stringify(fallback);

  return `(function(){try{var r=document.documentElement;var s=localStorage.getItem(${key});if(s!=="maps"&&s!=="domjudge"){s=${fallbackValue};}else{document.cookie=${cookie}+"="+s+";path=/;max-age=${COOKIE_MAX_AGE};samesite=lax";}r.setAttribute("data-skin",s);}catch(e){}})();`;
}

/** Writes the cookie the server reads, mirroring what the bootstrap does. */
export function writeSkinCookie(value: Skin) {
  // biome-ignore lint/suspicious/noDocumentCookie: the Cookie Store API it would rather have is not in Firefox
  document.cookie = `${SKIN_COOKIE}=${value};path=/;max-age=${COOKIE_MAX_AGE};samesite=lax`;
}
