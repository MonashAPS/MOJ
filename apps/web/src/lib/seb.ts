/** Where `middleware.ts` puts the URL the request actually asked for. */
export const SEB_URL_HEADER = "x-moj-request-url";

export const SEB_CONFIG_KEY_HEADER = "x-safeexambrowser-configkeyhash";
export const SEB_REQUEST_HASH_HEADER = "x-safeexambrowser-requesthash";

/**
 * The URL as SEB saw it.
 *
 * SEB hashes the string it put on the wire, so this has to be the browser's
 * view and not the server's: behind a reverse proxy `nextUrl` carries the
 * internal host and scheme, and a hash built from those matches nothing. The
 * path and query are taken verbatim for the same reason — normalising a
 * trailing slash or re-encoding a parameter changes the digest.
 */
export function sebRequestUrl(source: Headers, nextUrl: URL): string {
  const first = (name: string): string | null => source.get(name)?.split(",")[0]?.trim() || null;

  const proto = first("x-forwarded-proto") ?? nextUrl.protocol.replace(/:$/, "");
  const host = first("x-forwarded-host") ?? source.get("host") ?? nextUrl.host;
  return `${proto}://${host}${nextUrl.pathname}${nextUrl.search}`;
}
