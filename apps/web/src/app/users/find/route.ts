import { api } from "@convex/_generated/api";
import { type NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/convex-server";

/**
 * `user_ranking_redirect`: turn a handle into the leaderboard page that holds it
 * and land on `#!handle`, which highlights the row.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const handle = (params.get("handle") ?? params.get("search") ?? "").trim();
  const origin = request.nextUrl.origin;

  if (!handle) return NextResponse.redirect(new URL("/users/", origin), 302);

  const found = await query(api.rankings.find, { username: handle }).catch(() => null);
  if (!found) {
    // DMOJ raises a 404; the leaderboard with the handle still in the box is
    // kinder and keeps the member on the page they asked for.
    return NextResponse.redirect(new URL(`/users/?missing=${encodeURIComponent(handle)}`, origin), 302);
  }
  if (found.isUnlisted) {
    return NextResponse.redirect(new URL(`/user/${encodeURIComponent(found.username)}`, origin), 302);
  }

  const suffix = `#!${encodeURIComponent(found.username)}`;
  const path = found.page > 1 ? `/users/?page=${found.page}${suffix}` : `/users/${suffix}`;
  return NextResponse.redirect(new URL(path, origin), 302);
}
