import { type NextRequest, NextResponse } from "next/server";

/** Gates that must run before any page renders.
 *
 *  1. Staff 2FA, DMOJ's `DMOJ_REQUIRE_STAFF_2FA`: a staff account without a
 *     second factor is sent to /accounts/2fa/ to enrol. Account management
 *     stays reachable, as it does in DMOJ, because that is where the 2FA
 *     status and the enrolment link live.
 *  2. Pwned password: a stub. Better Auth's haveibeenpwned plugin blocks new
 *     passwords at sign-up; this gate is where the "your password appeared in a
 *     breach, change it" interstitial goes once the accounts agent adds the
 *     check. It reads a cookie set by the login flow so it costs nothing today.
 */

const EXEMPT_PREFIXES = [
  "/accounts/2fa",
  "/accounts/login",
  "/accounts/logout",
  "/accounts/register",
  "/accounts/activate",
  "/accounts/password",
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

  if (request.cookies.get("moj-password-compromised")?.value === "1") {
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
