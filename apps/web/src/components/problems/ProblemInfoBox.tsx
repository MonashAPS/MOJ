"use client";

import { api } from "@convex/_generated/api";
import {
  Badge,
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  cn,
  Panel,
  RatingName,
  Tooltip,
} from "@moj/ui";
import { useQuery } from "convex/react";
import {
  Check,
  ChevronRight,
  Clock,
  Code2,
  Database,
  HardDrive,
  LifeBuoy,
  PencilLine,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatDate } from "@/lib/format";
import { formatMemoryLimit, formatPoints, formatSeconds, formatTime, plural } from "@/lib/units";

export type ProblemDetail = NonNullable<(typeof api.problems.get)["_returnType"]>;

function Entry({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-baseline gap-2 py-1 text-sm">
      <span className="relative top-0.5 shrink-0 text-muted-foreground [&_svg]:size-3.5">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-subtle">{label}</span>
      <span className="shrink-0 text-right font-mono tabular-nums text-foreground">{children}</span>
    </div>
  );
}

function LangLimits({ rows }: { rows: { name: string; value: string }[] }) {
  if (rows.length === 0) return null;
  return (
    <dl className="mb-1 ml-[22px] grid min-w-0 gap-0.5">
      {rows.map((row) => (
        <div key={row.name} className="flex min-w-0 items-baseline justify-between gap-2 text-sm">
          <dt className="min-w-0 truncate text-muted-foreground">{row.name}</dt>
          <dd className="shrink-0 font-mono tabular-nums text-subtle">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Disclosure({
  label,
  defaultOpen = false,
  children,
}: {
  label: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-t border-border pt-2">
      <CollapsibleTrigger className="flex w-full items-center gap-1.5 text-left text-sm text-subtle hover:text-foreground">
        <ChevronRight
          size={12}
          aria-hidden
          className={cn("shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
        />
        <span>{label}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pb-1 pl-[18px] pt-1 text-sm text-subtle">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-sm border border-border bg-secondary px-2 py-1.5">
      <div className="truncate font-mono text-md font-medium tabular-nums text-foreground">{value}</div>
      <div className="font-sans text-xs font-semibold uppercase tracking-label text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

/** The viewer's "Show contests" preference (spec section 20, spoiler rule).
 *  There is no profile column for it yet, so it lives in `localStorage`, which
 *  is per viewer and survives a reload. */
const SHOW_CONTESTS_KEY = "moj.show-contests";

function useShowContests(): [boolean, (next: boolean) => void] {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      setShow(window.localStorage.getItem(SHOW_CONTESTS_KEY) === "1");
    } catch {
      // A browser with storage denied simply keeps the safe default.
    }
  }, []);
  return [
    show,
    (next: boolean) => {
      setShow(next);
      try {
        window.localStorage.setItem(SHOW_CONTESTS_KEY, next ? "1" : "0");
      } catch {
        // Nothing to remember when storage is unavailable.
      }
    },
  ];
}

/**
 * DMOJ's ticket row: "Manage tickets" for someone who can edit the problem,
 * "My tickets" for everyone else, with the open count as a badge
 * (`views/problem.py:177`). The count is the tickets the viewer may see.
 */
function TicketLink({ problem }: { problem: ProblemDetail }) {
  const tickets = useQuery(api.tickets.list, { problemCode: problem.code, onlyOwn: !problem.canEdit });
  if (!tickets || tickets.totalCount === 0) return null;
  const open = tickets.page.filter((ticket) => ticket.isOpen).length;

  return (
    <Link
      href={`/problem/${problem.code}/tickets/`}
      className="flex items-center gap-2 text-subtle hover:text-link"
    >
      <LifeBuoy size={13} aria-hidden className="shrink-0 text-muted-foreground" />
      <span>{problem.canEdit ? "Manage tickets" : "My tickets"}</span>
      {open > 0 ? (
        <Badge variant="accent" mono>
          {open}
        </Badge>
      ) : null}
    </Link>
  );
}

export function ProblemInfoBox({ problem }: { problem: ProblemDetail }) {
  const [allContests, setAllContests] = useState(false);
  const [showContests, setShowContests] = useShowContests();
  const contestProblem = problem.contestProblem;
  const points = contestProblem ? contestProblem.points : problem.points;
  const partial = contestProblem ? contestProblem.partial : problem.partial;
  const submissionsLeft = contestProblem?.submissionsLeft ?? null;
  const exhausted = submissionsLeft !== null && submissionsLeft <= 0;
  const appeared = allContests ? problem.appearedIn : problem.appearedIn.slice(0, 3);

  return (
    <Panel title={problem.code} bodyClassName="grid min-w-0 gap-3 p-3 [&>*]:min-w-0">
      {contestProblem ? (
        <p className="-mx-3 -mt-3 border-b border-primary-line bg-primary-soft px-3 py-2 text-sm text-subtle">
          Contest mode — problem{" "}
          <span className="font-mono font-medium text-foreground">{contestProblem.label}</span>
          {contestProblem.isPretested ? " · pretested" : null}
        </p>
      ) : null}

      <div>
        {problem.canSubmit && !exhausted ? (
          <Button asChild full>
            <Link href={`/problem/${problem.code}/submit`}>Submit solution</Link>
          </Button>
        ) : (
          <Button
            full
            disabled
            title={
              exhausted ? "You have no submissions left for this problem." : "Log in to submit a solution."
            }
          >
            Submit solution
          </Button>
        )}
        {submissionsLeft !== null ? (
          <p
            className={cn(
              "mt-1.5 text-center font-mono text-sm tabular-nums",
              exhausted ? "text-bad" : "text-muted-foreground",
            )}
          >
            {plural(submissionsLeft, "submission")} left
          </p>
        ) : null}
      </div>

      <div className="grid gap-1 border-t border-border pt-2 text-sm">
        {problem.viewer.hasSubmissions ? (
          <Link href={`/problem/${problem.code}/submissions/`} className="text-subtle hover:text-link">
            My submissions
          </Link>
        ) : null}
        <Link href={`/problem/${problem.code}/submissions/`} className="text-subtle hover:text-link">
          All submissions
        </Link>
        <Link href={`/problem/${problem.code}/rank/`} className="text-subtle hover:text-link">
          Best submissions
        </Link>
        <TicketLink problem={problem} />
      </div>

      <div className="border-t border-border pt-1">
        <Entry icon={<Check />} label="Points:">
          {formatPoints(points)}
          {partial ? <span className="text-muted-foreground"> (partial)</span> : null}
        </Entry>
        <Entry icon={<Clock />} label="Time limit:">
          {formatSeconds(problem.timeLimit)}
        </Entry>
        <LangLimits
          rows={problem.languageLimits.map((limit) => ({
            name: limit.languageName,
            value: formatSeconds(limit.timeLimit),
          }))}
        />
        <Entry icon={<HardDrive />} label="Memory limit:">
          {formatMemoryLimit(problem.memoryLimit)}
        </Entry>
        <LangLimits
          rows={problem.languageLimits.map((limit) => ({
            name: limit.languageName,
            value: formatMemoryLimit(limit.memoryLimit),
          }))}
        />
        {problem.showLanguages ? (
          <Entry icon={<Code2 />} label="Languages:">
            <Tooltip content={problem.allowedLanguages.map((language) => language.name).join(", ")}>
              <span>{problem.allowedLanguages.length}</span>
            </Tooltip>
          </Entry>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-1.5 border-t border-border pt-3">
        <Stat label="Solvers" value={problem.stats.solvers.toLocaleString("en-AU")} />
        <Stat label="Attempts" value={problem.stats.attempts.toLocaleString("en-AU")} />
        <Stat label="AC rate" value={`${problem.stats.acRate.toFixed(1)}%`} />
        <Stat label="Fastest" value={formatTime(problem.stats.bestTime)} />
      </div>
      {problem.stats.fastestSolver ? (
        <p className="-mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
          <Trophy size={12} aria-hidden />
          <RatingName
            username={problem.stats.fastestSolver.username}
            rating={problem.stats.fastestSolver.rating}
            href={`/user/${problem.stats.fastestSolver.username}`}
            isAdmin={problem.stats.fastestSolver.displayRank === "admin"}
          />
        </p>
      ) : null}

      {problem.authors.length > 0 ? (
        <div className="border-t border-border pt-2">
          <div className="flex min-w-0 items-baseline gap-2 text-sm">
            <PencilLine size={14} aria-hidden className="relative top-0.5 shrink-0 text-muted-foreground" />
            <span className="shrink-0 text-subtle">
              {problem.authors.length === 1 ? "Author:" : "Authors:"}
            </span>
            <span className="flex flex-wrap gap-x-1.5">
              {problem.authors.map((author) => (
                <RatingName
                  key={author.username}
                  username={author.username}
                  rating={author.rating}
                  href={`/user/${author.username}`}
                  isAdmin={author.displayRank === "admin"}
                />
              ))}
            </span>
          </div>
        </div>
      ) : null}

      {problem.types && problem.types.length > 0 ? (
        <Disclosure label={problem.types.length === 1 ? "Problem type" : "Problem types"}>
          {problem.types.map((type) => type.fullName).join(", ")}
        </Disclosure>
      ) : null}

      {problem.showLanguages ? (
        <Disclosure label="Allowed languages" defaultOpen>
          <span className="flex flex-wrap gap-x-1.5 gap-y-1">
            {problem.allowedLanguages.map((language) => (
              <span key={language.key}>{language.name}</span>
            ))}
          </span>
        </Disclosure>
      ) : null}

      {problem.canEdit ? (
        <div className="border-t border-border pt-2">
          <Entry icon={<Database />} label="Judges:">
            {problem.availableJudges > 0 ? (
              problem.availableJudges
            ) : (
              <span className="font-sans italic text-muted-foreground">none available</span>
            )}
          </Entry>
        </div>
      ) : null}
      {problem.appearedIn.length > 0 ? (
        <div className="border-t border-border pt-2">
          {/* A contest or workshop name can give the technique away, so the list
              is collapsed until the viewer asks for it (spec section 20). */}
          <button
            type="button"
            onClick={() => setShowContests(!showContests)}
            className="flex w-full items-center gap-1.5 text-left text-sm text-subtle hover:text-foreground"
            aria-expanded={showContests}
          >
            <ChevronRight
              size={12}
              aria-hidden
              className={cn(
                "shrink-0 text-muted-foreground transition-transform",
                showContests && "rotate-90",
              )}
            />
            <span>Show contests</span>
            <span className="ml-auto font-mono text-sm tabular-nums text-muted-foreground">
              {problem.appearedIn.length}
            </span>
          </button>
          {showContests ? (
            <>
              <ul className="mt-2 grid min-w-0 gap-1.5">
                {appeared.map((contest) => (
                  <li
                    key={`${contest.contestKey}-${contest.label}`}
                    className="flex min-w-0 items-center gap-2 text-sm"
                  >
                    <Badge variant="neutral" shape="square" mono>
                      {contest.label}
                    </Badge>
                    <Link
                      href={`/contest/${contest.contestKey}/ranking/`}
                      className="min-w-0 flex-1 truncate text-subtle hover:text-link"
                    >
                      {contest.contestName}
                    </Link>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                      {formatDate(contest.startTime)}
                    </span>
                  </li>
                ))}
              </ul>
              {problem.appearedIn.length > 3 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1"
                  onClick={() => setAllContests(!allContests)}
                >
                  {allContests ? "Show fewer" : `Show all ${problem.appearedIn.length}`}
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}
