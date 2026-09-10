import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth/server";

/**
 * DMOJ's `/impersonate/stop/`, which the user dropdown links to. Better Auth's
 * admin plugin hands back the original superuser's session; the cookies it sets
 * are copied onto the redirect so the browser is signed back in as itself.
 */
export async function GET(request: NextRequest) {
  const home = new URL("/", request.nextUrl.origin);
  try {
    const { headers } = await auth.api.stopImpersonating({
      headers: request.headers,
      returnHeaders: true,
    });
    const response = NextResponse.redirect(home);
    for (const cookie of headers.getSetCookie()) response.headers.append("set-cookie", cookie);
    return response;
  } catch {
    // Nobody was being impersonated; the way out is the same either way.
    return NextResponse.redirect(home);
  }
}
