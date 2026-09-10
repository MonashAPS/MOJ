"use client";

import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { formatDuration, useCountdown } from "@/lib/countdown";
import { ContestFloater } from "./ContestFloater";

/** Spec section 20. On a page that belongs to the contest we render the sticky
 *  ContestBar under the nav; anywhere else, while still in contest mode, DMOJ's
 *  draggable floater. Never both. */
export function ContestNavigation() {
  const pathname = usePathname() ?? "/";
  const data = useQuery(api.contests.navBar, {});
  const remaining = useCountdown(data?.endsAt ?? null);

  const problemMatch = /^\/problem\/([a-z0-9.]+)/.exec(pathname);
  const problemCode = problemMatch?.[1];
  const onContestPage =
    !!data &&
    (pathname.startsWith(`/contest/${data.contest.key}`) ||
      (!!problemCode && data.problems.some((problem) => problem.code === problemCode)));

  useEffect(() => {
    document.body.classList.toggle("has-contest-bar", onContestPage);
    return () => document.body.classList.remove("has-contest-bar");
  }, [onContestPage]);

  if (!data) return null;

  if (!onContestPage) {
    return (
      <ContestFloater
        contestKey={data.contest.key}
        contestName={data.contest.name}
        endsAt={data.isSpectating ? null : data.endsAt}
        mode={data.isSpectating ? "spectating" : data.isVirtual ? "virtual" : "live"}
      />
    );
  }

  const base = `/contest/${data.contest.key}`;
  return (
    <nav id="contest-bar" aria-label="Contest">
      <Link href={base} className="contest-bar-name">
        {data.contest.name}
      </Link>
      {data.problems.length > 0 ? (
        <>
          <span className="contest-bar-sep" aria-hidden />
          <div className="contest-bar-chips">
            {data.problems.map((problem) => (
              <Link
                key={problem.contestProblemId}
                href={`/problem/${problem.code}`}
                className={`contest-chip ${problem.state}${problemCode === problem.code ? " current" : ""}`}
                title={`${problem.label}. ${problem.name} (${problem.state})`}
                aria-current={problemCode === problem.code ? "page" : undefined}
              >
                {problem.label}
              </Link>
            ))}
          </div>
        </>
      ) : null}
      <span className="contest-bar-sep" aria-hidden />
      <div className="contest-bar-links">
        <Link href={`${base}/ranking/`}>Standings</Link>
        <Link href={`${base}/submissions/me/`}>Submissions</Link>
        {data.contest.useClarifications ? <Link href={`${base}#clarifications`}>Clarifications</Link> : null}
      </div>
      {remaining !== null ? (
        <span className="contest-bar-clock">
          {data.isSpectating ? "spectating" : formatDuration(remaining)}
        </span>
      ) : null}
    </nav>
  );
}
