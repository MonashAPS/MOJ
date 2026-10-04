import { api } from "@convex/_generated/api";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { queryAsViewer } from "@/lib/convex-server";
import { loadProblem } from "@/lib/problem.server";
import { problemsViewedCookieName } from "@/lib/problems-join-cover";

/** Both resource access and released contest membership must hold. */
export const requireContestProblem = cache(async (key: string, code: string) => {
  const [contest, problem] = await Promise.all([
    queryAsViewer(api.contests.navBar, { key, browsing: true }),
    loadProblem(code),
  ]);

  if (!problem || !contest?.problems.some((row) => row.code === code)) notFound();

  return contest;
});

export async function loadSubmitReminder(key: string | undefined, code: string) {
  if (!key) return undefined;
  const contest = await requireContestProblem(key, code);
  const jar = await cookies();

  return {
    key,
    name: contest.contest.name,
    eligible: contest.showJoinWarning,
    acknowledged: jar.get(problemsViewedCookieName(key))?.value === "1",
    // Full forms are rendered only after the existing canSubmit check.
    serverHadViewer: true,
  };
}
