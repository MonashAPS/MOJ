import { api } from "@convex/_generated/api";
import { notFound } from "next/navigation";
import { cache } from "react";
import { queryAsViewer } from "@/lib/convex-server";
import { loadProblem } from "@/lib/problem.server";

/** Both resource access and released contest membership must hold. */
export const requireContestProblem = cache(async (key: string, code: string) => {
  const [contest, problem] = await Promise.all([
    queryAsViewer(api.contests.navBar, { key, browsing: true }),
    loadProblem(code),
  ]);

  if (!problem || !contest?.problems.some((row) => row.code === code)) notFound();

  return contest;
});
