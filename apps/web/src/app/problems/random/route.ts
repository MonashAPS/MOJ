import { api } from "@convex/_generated/api";
import { type NextRequest, NextResponse } from "next/server";
import { queryAsViewer } from "@/lib/convex-server";
import { parseProblemQuery } from "@/lib/problem-query";

export const dynamic = "force-dynamic";

/**
 * DMOJ's `problem_random`: pick one problem out of the list the current filters
 * describe and redirect to it. The seed travels in the query because a Convex
 * query has to be deterministic to be reactive (see docs/SPEC_CHANGES.md).
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const query = parseProblemQuery(params);
  const seedParam = Number(params.get("seed"));
  const seed = Number.isFinite(seedParam) && seedParam !== 0 ? seedParam : Date.now();

  const picked = await queryAsViewer(api.problems.random, {
    group: query.category || undefined,
    types: query.types.length > 0 ? query.types : undefined,
    pointStart: query.pointStart ?? undefined,
    pointEnd: query.pointEnd ?? undefined,
    hasEditorial: query.hasEditorial || undefined,
    status: query.hideSolved ? "unsolved" : query.status,
    seed,
  }).catch(() => null);

  if (!picked) return NextResponse.redirect(new URL("/problems/", request.url));
  return NextResponse.redirect(new URL(`/problem/${picked.code}`, request.url));
}
