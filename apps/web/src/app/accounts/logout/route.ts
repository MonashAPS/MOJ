import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth/server";

/** DMOJ logs out with a POST, so the nav's log out control is a form. */
export async function POST(request: NextRequest) {
  await auth.api.signOut({ headers: request.headers, asResponse: true }).catch(() => undefined);
  const response = NextResponse.redirect(new URL("/", request.url), { status: 303 });
  for (const cookie of request.cookies.getAll()) {
    if (cookie.name.startsWith("moj.")) response.cookies.delete(cookie.name);
  }
  return response;
}

export async function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
