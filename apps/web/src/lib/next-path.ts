/** Django's `url_has_allowed_host_and_scheme`, kept small: a `next` parameter
 *  may only ever be a path on this site, so a crafted link cannot bounce someone
 *  off to another host after they log in. */
export function safeNext(value: string | null | undefined, fallback = "/"): string {
  if (!value) return fallback;

  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;

  if (value.includes("\n") || value.includes("\r")) return fallback;

  return value;
}
