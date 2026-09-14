import { type NextRequest, NextResponse } from "next/server";
import { COMPROMISED_COOKIE } from "@/auth/password-compromised";
import { SEB_URL_HEADER, sebRequestUrl } from "@/lib/seb";

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
 *
 *  It also stamps the request's own URL onto the headers for the Safe Exam
 *  Browser check. SEB hashes the URL it asked for, and a server component has
 *  `headers()` but no way to ask what URL is being rendered; this is the one
 *  place both that and the proxy's view of the host are available.
 */

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
} | null;

async function fetchSession(request: NextRequest): Promise<SessionResponse> {
  try {
    const response = await fetch(new URL("/api/auth/get-session", request.nextUrl.origin), {
      headers: { cookie: request.headers.get("cookie") ?? "" },
      cache: "no-store",
    });
    if (!response.ok) return null;
    return (await response.json()) as SessionResponse;
  } catch {
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  /** Carry on, with the request's URL stamped on for `lib/seb.server.ts`. */
  const proceed = (): NextResponse => {
    const headers = new Headers(request.headers);
    headers.set(SEB_URL_HEADER, sebRequestUrl(request.headers, request.nextUrl));
    return NextResponse.next({ request: { headers } });
  };

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

  if (EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return proceed();

  // Cheap negative check: no session cookie, nothing to gate.
  const cookieHeader = request.headers.get("cookie") ?? "";
  if (!cookieHeader.includes("moj.session_token")) return proceed();

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

  return proceed();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|fonts|media|.*\\.(?:svg|png|ico|webmanifest|woff2)$).*)"],
};
