/**
 * Sending a browser somewhere else on this site.
 *
 * `NextResponse.redirect` insists on an absolute URL, and the only origin a
 * route handler can reach for is the one the server is bound to — which behind
 * a reverse proxy is `0.0.0.0:3000`, and that is where the browser was being
 * sent. A relative `Location` is resolved against the address the browser
 * actually asked for, so there is no origin to get wrong and nothing to
 * configure.
 *
 * Only for somewhere on this site: a redirect off it needs the whole URL, and
 * should say so at the call site.
 */
export function redirectTo(path: string, status: 302 | 303 | 307 | 308 = 302): Response {
  return new Response(null, { status, headers: { location: path } });
}
