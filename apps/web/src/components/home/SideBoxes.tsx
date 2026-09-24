"use client";

import { api } from "@convex/_generated/api";
import { Button, cn, Panel, Progress, RatingName } from "@moj/ui";
import { useQuery } from "convex/react";
import {
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  MessageSquare,
  Plus,
  Timer,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { COUNTDOWN_HORIZON, formatDuration, useCountdown } from "@/lib/countdown";
import { formatDate, formatDateTime } from "@/lib/format";

/** A box's footer links sit on one right-aligned row above a thin rule. */
function BoxFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-3 -mb-3 mt-3 flex items-center justify-end gap-3 border-t border-border px-3 py-2 text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function FeedLinks({ base }: { base: string }) {
  return (
    <>
      <a href={`${base}/rss/`} className="text-muted-foreground hover:text-subtle">
        RSS
      </a>
      <a href={`${base}/atom/`} className="text-muted-foreground hover:text-subtle">
        Atom
      </a>
    </>
  );
}

export function ContestsBox() {
  const contests = useQuery(api.contests.homeSidebar, { limit: 8 });

  if (contests === undefined)
    return (
      <Panel title="Contests" icon={<Trophy size={14} />}>
        {null}
      </Panel>
    );

  const ongoing = contests.filter((contest) => contest.state === "ongoing");
  const upcoming = contests.filter((contest) => contest.state === "upcoming");

  if (ongoing.length === 0 && upcoming.length === 0) {
    return (
      <Panel title="Contests" icon={<Trophy size={14} />} bodyClassName="p-3">
        <p className="text-sm text-muted-foreground">Nothing is scheduled right now.</p>
        <BoxFooter>
          <Link href="/contests/" className="text-muted-foreground hover:text-subtle">
            Past contests
          </Link>
        </BoxFooter>
      </Panel>
    );
  }

  return (
    <>
      {ongoing.length > 0 ? (
        <Panel title="Ongoing contests" icon={<Timer size={14} />} bodyClassName="p-0">
          <ul>
            {ongoing.map((contest) => (
              <OngoingRow key={contest._id} contest={contest} />
            ))}
          </ul>
        </Panel>
      ) : null}

      {upcoming.length > 0 ? (
        <Panel title="Upcoming contests" icon={<CalendarClock size={14} />} bodyClassName="p-0">
          <ul>
            {upcoming.slice(0, 5).map((contest) => (
              <UpcomingRow key={contest._id} contest={contest} />
            ))}
          </ul>
          <div className="flex items-center justify-end border-t border-border px-3 py-2 text-sm">
            <Link href="/contests/" className="text-muted-foreground hover:text-subtle">
              Full calendar
            </Link>
          </div>
        </Panel>
      ) : null}
    </>
  );
}

type SidebarContest = {
  _id: string;
  key: string;
  name: string;
  startTime: number;
  endTime: number;
};

function OngoingRow({ contest }: { contest: SidebarContest }) {
  const remaining = useCountdown(contest.endTime);
  const total = Math.max(1, contest.endTime - contest.startTime);
  const elapsed = remaining === null ? 0 : Math.min(100, Math.max(0, ((total - remaining) / total) * 100));
  const urgent = remaining !== null && remaining < 60_000;
  const soon = remaining !== null && remaining < 300_000;
  const openEnded = remaining !== null && remaining > COUNTDOWN_HORIZON;

  return (
    <li className="grid gap-2 border-b border-border p-3 last:border-b-0">
      <Link href={`/contest/${contest.key}`} className="font-display text-h3 font-semibold leading-tight">
        {contest.name}
      </Link>
      <div className="grid gap-1">
        <span className="font-sans text-xs font-semibold uppercase tracking-label text-muted-foreground">
          {openEnded ? "ends" : "ends in"}
        </span>
        <span
          className={cn(
            "font-mono text-base font-medium tabular-nums",
            urgent ? "text-bad" : soon ? "text-warn" : "text-foreground",
          )}
          title={new Date(contest.endTime).toString()}
        >
          {remaining === null ? "—" : openEnded ? formatDate(contest.endTime) : formatDuration(remaining)}
        </span>
      </div>
      {openEnded ? null : <Progress value={elapsed} aria-label="Contest elapsed" />}
      <div className="flex justify-end">
        <Button asChild size="sm">
          <Link href={`/contest/${contest.key}`}>Enter</Link>
        </Button>
      </div>
    </li>
  );
}

function UpcomingRow({ contest }: { contest: SidebarContest }) {
  const remaining = useCountdown(contest.startTime);

  return (
    <li className="grid min-w-0 gap-0.5 border-b border-border p-3 last:border-b-0">
      <Link href={`/contest/${contest.key}`} className="truncate text-base font-medium text-link">
        {contest.name}
      </Link>
      <span className="text-sm text-muted-foreground" title={new Date(contest.startTime).toString()}>
        {formatDateTime(contest.startTime)}
      </span>
      <span className="font-mono text-sm tabular-nums text-subtle">
        {remaining !== null && remaining <= COUNTDOWN_HORIZON
          ? `starts in ${formatDuration(remaining)}`
          : null}
      </span>
    </li>
  );
}

export function RecentCommentsBox() {
  const comments = useQuery(api.comments.recent, { limit: 10 });

  if (comments === undefined || comments.length === 0) return null;

  return (
    <Panel title="Recent comments" icon={<MessageSquare size={14} />}>
      <ul className="grid min-w-0">
        {comments.map((comment) => (
          <li key={comment._id} className="flex min-w-0 items-start gap-1.5 py-1 text-list leading-[1.35]">
            <RatingName username={comment.author} rating={comment.authorRating} className="shrink-0" />
            <ChevronRight size={12} aria-hidden className="mt-0.5 shrink-0 text-muted-foreground" />
            <Link href={comment.href} className="line-clamp-2 min-w-0 flex-1 text-link">
              {comment.targetTitle}
            </Link>
          </li>
        ))}
      </ul>
      <BoxFooter>
        <FeedLinks base="/comments" />
      </BoxFooter>
    </Panel>
  );
}

export function NewProblemsBox({ states }: { states?: Record<string, "solved" | "partial" | "attempted"> }) {
  const problems = useQuery(api.problems.recent, { limit: 7 });

  if (problems === undefined || problems.length === 0) return null;

  return (
    <Panel title="New problems" icon={<Plus size={14} />}>
      <ul className="grid min-w-0">
        {problems.map((problem) => {
          const state = states?.[problem.code];

          return (
            <li key={problem._id} className="flex min-w-0 items-center gap-2 py-0.5">
              {state === "solved" ? (
                <CheckCircle2 size={14} aria-label="Solved" className="shrink-0 text-good" />
              ) : state ? (
                <CircleDashed size={14} aria-label="Attempted" className="shrink-0 text-muted-foreground" />
              ) : null}
              <Link href={`/problem/${problem.code}`} className="min-w-0 flex-1 truncate text-list text-link">
                {problem.name}
              </Link>
              <span className="shrink-0 font-mono text-list tabular-nums text-muted-foreground">
                {problem.points}p
              </span>
            </li>
          );
        })}
      </ul>
      <BoxFooter>
        <FeedLinks base="/problems" />
      </BoxFooter>
    </Panel>
  );
}

export function TopUsersBox({ viewerUsername }: { viewerUsername?: string }) {
  const users = useQuery(api.rankings.top, { limit: 10 });

  if (users === undefined || users.length === 0) return null;

  return (
    <Panel title="Top users" icon={<Trophy size={14} />}>
      <ol className="grid min-w-0">
        {users.map((user, index) => {
          const isViewer = viewerUsername === user.username;

          return (
            <li
              key={user._id}
              className={cn(
                "flex h-6 min-w-0 items-center gap-2 rounded-xs px-1 text-list",
                isViewer && "bg-row-selected",
              )}
            >
              <span className="w-[2ch] shrink-0 text-right font-mono text-list tabular-nums text-muted-foreground">
                {index + 1}
              </span>
              <RatingName
                username={user.username}
                rating={user.rating}
                href={`/user/${user.username}`}
                isAdmin={user.displayRank === "admin"}
                className={cn("min-w-0 flex-1 truncate", isViewer && "font-bold")}
              />
              <span className="shrink-0 font-mono text-list tabular-nums text-subtle">
                {user.performancePoints.toFixed(0)}
              </span>
            </li>
          );
        })}
      </ol>
      <BoxFooter>
        <Link href="/users/" className="text-muted-foreground hover:text-subtle">
          Full ranking
        </Link>
      </BoxFooter>
    </Panel>
  );
}
