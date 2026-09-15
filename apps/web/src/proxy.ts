import { type NextRequest, NextResponse } from "next/server";
import { COMPROMISED_COOKIE } from "@/auth/password-compromised";
import { readJsonBody } from "@/lib/json-body";
import { convexSiteUrl } from "@/lib/public-config.server";

/** Gates that must run before any page renders.
 *
 *  1. Staff 2FA, DMOJ's `DMOJ_REQUIRE_STAFF_2FA`: a staff account without a
 *     second factor is sent to /accounts/2fa/ to enrol, carrying the page they
 *     were headed for so enrolment returns them to it. Account management stays
 *     reachable, as it does in DMOJ, because that is where the 2FA status and
 *     the enrolment link live.
 *  2. Pwned password, DMOJ's `password_pwned` session flag: the login hook in
 *     auth/server.ts checks the typed password against Have I Been Pwned and
 *     sets a cookie on a hit. This gate turns that cookie into DMOJ's forced
 *     password change; completing one clears the cookie.
 */

const PROBLEMS_API = "/api/problems";

/** The problems API is a Convex HTTP action, but operators should not have to
 *  publish a second hostname or teach a CI secret about it. `/api/problems/*`
 *  on the web origin is proxied to the Convex site origin, so `JUDGE_URL` is
 *  just the address of the site. Caddy has the same route in front of a
 *  deployment (infra/Caddyfile) for the case where the web app is not in the
 *  request path.
 *
 *  The route is here and not a `rewrites()` entry in next.config.ts because a
 *  rewrite destination is fixed when the image is built, and one published
 *  image serves any host. */
function problemsApiTarget(request: NextRequest): URL | null {
  const { pathname, search } = request.nextUrl;

  if (pathname !== PROBLEMS_API && !pathname.startsWith(`${PROBLEMS_API}/`)) return null;

  const target = new URL(`${convexSiteUrl()}${pathname}`);
  target.search = search;

  return target;
}

const EXEMPT_PREFIXES = [
  "/accounts/2fa",
  "/accounts/login",
  "/accounts/logout",
  "/accounts/register",
  "/accounts/activate",
  "/accounts/password",
  "/accounts/reset",
  "/accounts/email",
  "/accounts/api",
  "/edit/profile",
  "/api/auth",
  "/media",
  "/_next",
  "/fonts",
  "/favicon",
  "/icon.svg",
  "/logo.svg",
];

type SessionResponse = {
  user?: { id: string; isStaff?: boolean; twoFactorEnabled?: boolean | null };
};

/** The gate reads three fields off `/api/auth/get-session`, so that is all it
 *  decodes; anything else the endpoint answers with counts as signed out. */
function isSessionResponse(value: unknown): value is SessionResponse {
  if (typeof value !== "object" || value === null) return false;

  if (!("user" in value)) return true;
  const { user } = value;

  return typeof user === "object" && user !== null && "id" in user && typeof user.id === "string";
}

async function fetchSession(request: NextRequest): Promise<SessionResponse | null> {
  try {
    const response = await fetch(new URL("/api/auth/get-session", request.nextUrl.origin), {
      headers: { cookie: request.headers.get("cookie") ?? "" },
      cache: "no-store",
    });

    if (!response.ok) return null;

    return await readJsonBody(response, isSessionResponse);
  } catch {
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const problemsApi = problemsApiTarget(request);

  if (problemsApi) return NextResponse.rewrite(problemsApi);

  // DMOJ's URLs all end in a slash and old links must keep working. Next's own
  // redirect is disabled (skipTrailingSlashRedirect) so it does not fire on the
  // auth API, which better-call matches without one.
  // `/_next/hmr` is a websocket upgrade, and a 308 to `/_next/hmr/` fails the
  // handshake, which leaves the dev runtime unable to hydrate the page at all.
  if (
    !pathname.startsWith("/api/") &&
    !pathname.startsWith("/_next") &&
    pathname !== "/" &&
    !pathname.endsWith("/") &&
    !pathname.slice(pathname.lastIndexOf("/")).includes(".")
  ) {
    // A plain URL, not nextUrl.clone(): NextURL re-applies the `trailingSlash`
    // config when it serialises, which turns the redirect target back into the
    // path we were already on and loops.
    const url = new URL(request.url);
    url.pathname = `${pathname}/`;

    return NextResponse.redirect(url, 308);
  }

  if (EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return NextResponse.next();

  // Cheap negative check: no session cookie, nothing to gate.
  const cookieHeader = request.headers.get("cookie") ?? "";

  if (!cookieHeader.includes("moj.session_token")) return NextResponse.next();

  if (request.cookies.get(COMPROMISED_COOKIE)?.value === "1") {
    const url = request.nextUrl.clone();
    url.pathname = "/accounts/password/change/";
    url.searchParams.set("compromised", "1");

    return NextResponse.redirect(url);
  }

  const session = await fetchSession(request);
  const user = session?.user;

  if (user?.isStaff && !user.twoFactorEnabled) {
    const url = request.nextUrl.clone();
    url.pathname = "/accounts/2fa/";
    url.search = `?required=1&next=${encodeURIComponent(pathname)}`;

    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|fonts|media|.*\\.(?:svg|png|ico|webmanifest|woff2)$).*)"],
};
