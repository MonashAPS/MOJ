import { api } from "@convex/_generated/api";
import type { NextRequest } from "next/server";
import { query } from "@/lib/convex-server";
import { redirectTo } from "@/lib/redirect";

/**
 * `user_ranking_redirect`: turn a handle into the leaderboard page that holds it
 * and land on `#!handle`, which highlights the row.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const handle = (params.get("handle") ?? params.get("search") ?? "").trim();

  if (!handle) return redirectTo("/users/");

  const found = await query(api.rankings.find, { username: handle }).catch(() => null);

  if (!found) {
    // DMOJ raises a 404; the leaderboard with the handle still in the box is
    // kinder and keeps the member on the page they asked for.
    return redirectTo(`/users/?missing=${encodeURIComponent(handle)}`);
  }

  if (found.isUnlisted) {
    return redirectTo(`/user/${encodeURIComponent(found.username)}`);
  }

  const suffix = `#!${encodeURIComponent(found.username)}`;
  const path = found.page > 1 ? `/users/?page=${found.page}${suffix}` : `/users/${suffix}`;

  return redirectTo(path);
}
