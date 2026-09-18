import type { NextRequest } from "next/server";
import { auth } from "@/auth/server";
import { redirectTo } from "@/lib/redirect";

/**
 * DMOJ's `/impersonate/stop/`, which the user dropdown links to. Better Auth's
 * admin plugin hands back the original superuser's session; the cookies it sets
 * are copied onto the redirect so the browser is signed back in as itself.
 */
export async function GET(request: NextRequest) {
  try {
    const { headers } = await auth.api.stopImpersonating({
      headers: request.headers,
      returnHeaders: true,
    });

    const response = redirectTo("/");

    for (const cookie of headers.getSetCookie()) response.headers.append("set-cookie", cookie);

    return response;
  } catch {
    // Nobody was being impersonated; the way out is the same either way.
    return redirectTo("/");
  }
}
