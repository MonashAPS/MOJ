"use client";

import type { SubmissionListRow } from "@convex/submissions";
import { cn, focusRingInset, RatingName, Tooltip, VerdictPill } from "@moj/ui";
import { Eye, Loader2, RefreshCw, XCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  absoluteTime,
  DASH,
  formatMemory,
  formatScore,
  formatTime,
  isGrading,
  relativeTime,
  verdictCode,
} from "@/lib/submissionFormat";

/** `--v-<verdict>` for the 3px rail, through the one tone resolver's families. */
const RAIL: Record<string, string> = {
  good: "bg-good",
  bad: "bg-bad",
  warn: "bg-warn",
  neutral: "bg-neutral",
  run: "bg-run",
  ie: "bg-ie",
};

function railClass(tone: string): string {
  return RAIL[tone] ?? "bg-neutral";
}

export type RowPermissions = {
  username: string | null;
  canRejudge: boolean;
  canAbortAny: boolean;
  canEditAllProblems: boolean;
  problemEditable: boolean;
};

/**
 * DMOJ's `submission/row.html`, restyled to DESIGN.md section 12.2: the
 * saturated left block becomes a 3px rail, the score and the verdict pill move
 * onto the first line, and the row never moves while it is being judged.
 */
export function SubmissionRow({
  row,
  tone,
  showProblem,
  permissions,
  now,
  isNew,
  onRejudge,
  onAbort,
}: {
  row: SubmissionListRow;
  tone: string;
  showProblem: boolean;
  permissions: RowPermissions;
  now: number;
  isNew: boolean;
  onRejudge: (id: number | string) => void;
  onAbort: (id: number | string) => void;
}) {
  const grading = isGrading(row.status);
  const code = verdictCode(row);
  const score = formatScore(row.casePoints, row.caseTotal);
  const showScore = !grading && row.status !== "IE" && row.status !== "CE" && row.status !== "AB";
  const noUsage = ["QU", "P", "G", "CE", "IE", "AB"].includes(row.status);
  const isOwn = permissions.username !== null && permissions.username === row.user?.username;
  const canRejudge =
    permissions.canRejudge && (permissions.canEditAllProblems || permissions.problemEditable);
  const canAbort = grading && (permissions.canAbortAny || isOwn);

  const href = row.canSeeDetail
    ? `/submission/${row.id}`
    : row.problem
      ? `/problem/${row.problem.code}`
      : "/submissions/";

  return (
    <li
      data-verdict={code}
      className={cn(
        "group relative isolate flex min-h-(--row-h-2) items-stretch border-b border-border last:border-b-0",
        "transition-colors duration-(--dur-fast) hover:bg-row-hover",
        isNew && "animate-in fade-in duration-(--dur) ease-house",
      )}
    >
      {/* The rail replaces DMOJ's ~90px saturated fill: twenty AC rows read as a
          green margin rule, not a green wall. It cross-fades on a verdict change. */}
      <span
        aria-hidden
        className={cn(
          "w-[3px] shrink-0 transition-colors duration-(--dur-fast) ease-house",
          railClass(tone),
          grading && "animate-pulse-judging",
        )}
      />

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="shrink-0 font-mono text-sm font-medium tabular-nums text-foreground">
            {showScore ? (
              <>
                {score.earned}
                <span className="text-muted-foreground"> / {score.total}</span>
              </>
            ) : grading ? (
              <span className="inline-flex items-center gap-1 text-run">
                <Loader2 aria-hidden className="size-3 animate-spin-slow" />
                <span className="sr-only">Judging</span>
              </span>
            ) : (
              <span className="text-muted-foreground">{DASH}</span>
            )}
          </span>

          {showProblem ? (
            row.problem ? (
              <Link
                href={`/problem/${row.problem.code}`}
                className="relative z-10 min-w-0 truncate font-medium text-foreground hover:text-link"
              >
                {row.problem.name}
              </Link>
            ) : (
              <span className="min-w-0 truncate text-muted-foreground">Deleted problem</span>
            )
          ) : null}

          <span className="ml-auto flex shrink-0 items-center gap-2">
            <VerdictPill
              verdict={code}
              judging={grading}
              label={grading ? row.status : undefined}
              className="transition-colors duration-(--dur-fast)"
            />
            <span className="font-mono text-xs uppercase text-muted-foreground">
              {row.language?.shortName || row.language?.name || DASH}
            </span>
          </span>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
          {row.user ? (
            <RatingName
              username={row.user.username}
              rating={row.user.rating}
              href={`/user/${row.user.username}`}
              isAdmin={row.user.displayRank === "admin"}
              className="relative z-10 text-sm"
            />
          ) : null}
          <span aria-hidden>·</span>
          <RelativeStamp date={row.date} now={now} />
          {row.contest ? (
            <>
              <span aria-hidden>·</span>
              <Link
                href={`/contest/${row.contest.key}`}
                className="relative z-10 truncate hover:text-link"
                title={row.contest.name}
              >
                {row.contest.name}
              </Link>
            </>
          ) : null}
          {grading && row.currentTestcase > 0 ? (
            <>
              <span aria-hidden>·</span>
              <span className="font-mono tabular-nums text-run">Case #{row.currentTestcase}</span>
            </>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end justify-center gap-0.5 px-3 py-2 text-right font-mono text-sm tabular-nums">
        <span className={cn(noUsage || row.result === "TLE" ? "text-muted-foreground" : "text-foreground")}>
          {noUsage || row.result === "TLE" ? DASH : formatTime(row.time)}
        </span>
        <span className="text-muted-foreground">{noUsage ? DASH : formatMemory(row.memory)}</span>
      </div>

      {(row.canSeeDetail || canRejudge || canAbort) && (
        <div className="flex shrink-0 items-center gap-1 pr-3">
          {row.canSeeDetail ? (
            <Tooltip content="View this submission">
              <Link
                href={`/submission/${row.id}`}
                aria-label={`View submission ${row.id}`}
                className="relative z-10 inline-flex size-(--control-h-sm) items-center justify-center rounded-md text-subtle hover:bg-row-hover hover:text-foreground"
              >
                <Eye aria-hidden className="size-3.5" />
              </Link>
            </Tooltip>
          ) : null}
          {canRejudge ? (
            row.isLocked ? (
              <Tooltip content="This submission has been locked, and cannot be rejudged.">
                <span className="relative z-10 inline-flex size-(--control-h-sm) items-center justify-center rounded-md text-muted-foreground opacity-50">
                  <RefreshCw aria-hidden className="size-3.5" />
                </span>
              </Tooltip>
            ) : (
              <Tooltip content="Rejudge this submission">
                <button
                  type="button"
                  aria-label={`Rejudge submission ${row.id}`}
                  onClick={() => onRejudge(row.id)}
                  className="relative z-10 inline-flex size-(--control-h-sm) items-center justify-center rounded-md text-subtle hover:bg-row-hover hover:text-foreground"
                >
                  <RefreshCw aria-hidden className="size-3.5" />
                </button>
              </Tooltip>
            )
          ) : null}
          {canAbort ? (
            <Tooltip content="Abort this submission">
              <button
                type="button"
                aria-label={`Abort submission ${row.id}`}
                onClick={() => onAbort(row.id)}
                className="relative z-10 inline-flex size-(--control-h-sm) items-center justify-center rounded-md text-subtle hover:bg-row-hover hover:text-bad"
              >
                <XCircle aria-hidden className="size-3.5" />
              </button>
            </Tooltip>
          ) : null}
        </div>
      )}

      {/* The whole row is the hit area; the links above it stay clickable. */}
      <Link
        href={href}
        aria-label={row.problem ? `Submission ${row.id} for ${row.problem.name}` : `Submission ${row.id}`}
        className={cn("absolute inset-0", focusRingInset)}
      >
        <span className="sr-only">Open submission {row.id}</span>
      </Link>
    </li>
  );
}

/** The relative stamp is computed on the client from a server-supplied `now`, so
 *  the first paint matches the server's and never hydrates differently. */
function RelativeStamp({ date, now }: { date: number; now: number }) {
  const [reference, setReference] = useState(now);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      setReference(Date.now());
    }
    const timer = setInterval(() => setReference(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <time dateTime={new Date(date).toISOString()} title={absoluteTime(date)} className="whitespace-nowrap">
      {relativeTime(date, reference)}
    </time>
  );
}
