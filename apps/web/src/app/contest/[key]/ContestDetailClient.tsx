"use client";

import { api } from "@convex/_generated/api";
import type { ContestDetail, ContestProblemEntry } from "@convex/contests";
import {
  Badge,
  Button,
  cn,
  ContentDescription,
  EmptyRow,
  MicroLabel,
  Panel,
  RatingName,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TitleRow,
  Tooltip,
  TwoColumn,
} from "@moj/ui";
import { useQuery } from "convex/react";
import { BookOpen, CircleHelp, Clock, MessageSquareWarning } from "lucide-react";
import Link from "next/link";
import { ContestChips, ProblemStateIcon, humanDuration, OPEN_ENDED } from "@/components/contests/pieces";
import { JoinControl } from "@/components/contests/JoinControls";
import { COUNTDOWN_HORIZON, formatDuration, useCountdown } from "@/lib/countdown";
import { formatDateTime, formatPoints } from "@/lib/format";
import { Clarifications } from "./Clarifications";
import { contestTabs, joinKindFor } from "./tabs";

const DASH = "—";

/** DMOJ's `#banner`: one sentence saying where the viewer stands in the clock. */
function Banner({ detail }: { detail: ContestDetail }) {
  const contest = detail.contest;
  const participation = detail.participation;
  const live = detail.liveParticipation;
  const spectating = participation?.virtual === -1;
  const virtual = (participation?.virtual ?? 0) > 0;

  const target = spectating
    ? (contest?.endTime ?? null)
    : virtual
      ? (participation?.endsAt ?? null)
      : !detail.timing.started
        ? (contest?.startTime ?? null)
        : detail.timing.ended
          ? null
          : live && !live.ended
            ? live.endsAt
            : (contest?.endTime ?? null);

  const remaining = useCountdown(target);
  const readable = remaining !== null && remaining <= COUNTDOWN_HORIZON;
  const clock = readable ? formatDuration(remaining) : null;

  let sentence: string;
  if (spectating) sentence = clock ? `Spectating, contest ends in ${clock}.` : "Spectating.";
  else if (virtual) sentence = clock ? `Participating virtually, ${clock} remaining.` : "Participating virtually.";
  else if (!detail.timing.started) sentence = clock ? `Starting in ${clock}.` : "Not started yet.";
  else if (detail.timing.ended) sentence = "Contest is over.";
  else if (live && live.ended) sentence = clock ? `Your time is up! Contest ends in ${clock}.` : "Your time is up!";
  else if (live) sentence = clock ? `You have ${clock} remaining.` : "Participating.";
  else sentence = clock ? `Contest ends in ${clock}.` : "Contest is running.";

  const urgent = readable && remaining !== null && remaining < 300_000 && !detail.timing.ended;

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-md border border-border bg-card px-4 py-3">
      <span className={cn("flex items-center gap-2 font-medium", urgent && "text-bad")}>
        <Clock size={16} className={urgent ? "text-bad" : "text-muted-foreground"} aria-hidden />
        <span className="font-mono tabular-nums">{sentence}</span>
      </span>
      {contest ? (
        <span className="font-mono text-sm tabular-nums text-muted-foreground">
          {contest.timeLimit
            ? `${humanDuration(contest.timeLimit * 1000)} window between ${formatDateTime(contest.startTime)} and ${formatDateTime(contest.endTime)}`
            : contest.endTime - contest.startTime > OPEN_ENDED
              ? `Open-ended, starting on ${formatDateTime(contest.startTime)}`
              : `${humanDuration(contest.endTime - contest.startTime)} long, starting on ${formatDateTime(contest.startTime)}`}
        </span>
      ) : null}
    </div>
  );
}

function ProblemRow({
  problem,
  contestKey,
  showEditorials,
  showState,
  ended,
  precision,
}: {
  problem: ContestProblemEntry;
  contestKey: string;
  showEditorials: boolean;
  showState: boolean;
  ended: boolean;
  precision: number;
}) {
  const solvedNote =
    problem.state === "solved"
      ? ended && problem.solvedSinceContest
        ? "Solved since the contest"
        : problem.solvedDuringContest
          ? "Solved during the contest"
          : "Solved"
      : problem.state === "partial"
        ? "Partially solved"
        : problem.state === "attempted"
          ? "Attempted"
          : "Not attempted";

  return (
    <TableRow className="group">
      {showState ? (
        <TableCell className="relative w-7 pr-0">
          <ProblemStateIcon state={problem.state} title={solvedNote} />
        </TableCell>
      ) : null}
      <TableCell className="relative">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-mono text-sm font-medium text-muted-foreground">{problem.label}</span>
          {problem.isAccessible ? (
            <Link
              href={`/problem/${problem.code}/`}
              className="font-medium text-foreground before:absolute before:inset-0 hover:text-link"
            >
              {problem.name}
            </Link>
          ) : (
            <span className="font-medium text-foreground">{problem.name}</span>
          )}
          <span className="font-mono text-sm text-muted-foreground">{problem.code}</span>
          {problem.isPretested ? (
            <Badge variant="neutral" shape="square" mono>
              pretested
            </Badge>
          ) : null}
        </span>
      </TableCell>
      <TableCell numeric>
        {formatPoints(problem.points, precision)}
        {problem.partial ? <span className="text-muted-foreground">p</span> : null}
      </TableCell>
      {showState ? (
        <TableCell numeric>
          {problem.state === "untouched" ? (
            <span className="text-muted-foreground">{DASH}</span>
          ) : ended && problem.contestBestScore !== problem.bestScore ? (
            <Tooltip content={`${formatPoints(problem.contestBestScore, precision)} during the contest`}>
              <span>
                {formatPoints(problem.bestScore, precision)}
                <span className="text-muted-foreground">{` / ${formatPoints(problem.points, precision)}`}</span>
              </span>
            </Tooltip>
          ) : (
            <span>
              {formatPoints(problem.bestScore, precision)}
              <span className="text-muted-foreground">{` / ${formatPoints(problem.points, precision)}`}</span>
            </span>
          )}
        </TableCell>
      ) : null}
      <TableCell numeric>{`${problem.acRate.toFixed(1)}%`}</TableCell>
      <TableCell numeric className="relative z-1">
        {problem.isAccessible ? (
          <Link href={`/contest/${contestKey}/rank/${problem.code}/`}>{problem.publicSolveCount}</Link>
        ) : (
          problem.publicSolveCount
        )}
      </TableCell>
      {showEditorials ? (
        <TableCell className="relative z-1 w-8 text-center">
          {problem.isAccessible && problem.hasPublicEditorial ? (
            <Tooltip content="Editorial">
              <Link href={`/problem/${problem.code}/editorial/`} className="text-good">
                <BookOpen size={14} aria-hidden />
                <span className="sr-only">Editorial</span>
              </Link>
            </Tooltip>
          ) : (
            <BookOpen size={14} className="text-muted-foreground opacity-35" aria-hidden />
          )}
        </TableCell>
      ) : null}
    </TableRow>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[max-content_minmax(0,1fr)] items-baseline gap-x-3 border-b border-border px-3 py-2 last:border-b-0">
      <MicroLabel>{label}</MicroLabel>
      <span className="min-w-0 text-base">{children}</span>
    </div>
  );
}

function UserList({ users }: { users: { _id: string; username: string; displayName: string; rating: number | null; displayRank: string }[] }) {
  return (
    <span className="flex flex-wrap gap-x-2 gap-y-1">
      {users.map((user) => (
        <RatingName
          key={user._id}
          username={user.username}
          displayName={user.displayName}
          rating={user.rating}
          href={`/user/${user.username}/`}
          isAdmin={user.displayRank === "admin"}
        />
      ))}
    </span>
  );
}

const SCOREBOARD_COPY: Record<string, string> = {
  V: "Visible for the duration of the contest.",
  C: "Hidden until your window is over.",
  P: "Hidden for the entire duration of the contest.",
  H: "Hidden, even after the contest is over.",
};

function Sidebar({ detail }: { detail: ContestDetail }) {
  const contest = detail.contest;
  if (!contest) return null;

  const ratingLine = !contest.isRated
    ? "This contest will not be rated."
    : contest.ratingFloor !== null && contest.ratingCeiling !== null
      ? `Rated for participants rated between ${contest.ratingFloor} and ${contest.ratingCeiling}.`
      : contest.ratingFloor !== null
        ? `Rated for participants rated at least ${contest.ratingFloor}.`
        : contest.ratingCeiling !== null
          ? `Rated for participants rated at most ${contest.ratingCeiling}.`
          : "This contest is rated.";

  return (
    <>
      <Panel title="Contest" bodyClassName="p-0">
        <InfoRow label="Starts">
          <span className="font-mono text-sm tabular-nums">{formatDateTime(contest.startTime)}</span>
        </InfoRow>
        <InfoRow label="Ends">
          <span className="font-mono text-sm tabular-nums">
            {contest.endTime - contest.startTime > OPEN_ENDED ? DASH : formatDateTime(contest.endTime)}
          </span>
        </InfoRow>
        <InfoRow label={contest.timeLimit ? "Window" : "Duration"}>
          <span className="font-mono text-sm tabular-nums">
            {contest.timeLimit
              ? humanDuration(contest.timeLimit * 1000)
              : contest.endTime - contest.startTime > OPEN_ENDED
                ? "Open-ended"
                : humanDuration(contest.endTime - contest.startTime)}
          </span>
        </InfoRow>
        <InfoRow label="Format">
          <span>{detail.format.displayName}</span>
        </InfoRow>
        <InfoRow label="Rated">{ratingLine}</InfoRow>
        <InfoRow label="Scoreboard">
          {SCOREBOARD_COPY[contest.scoreboardVisibility] ?? "Visible for the duration of the contest."}
        </InfoRow>
        {contest.freezeMinutes > 0 ? (
          <InfoRow label="Freeze">
            <span className="font-mono text-sm tabular-nums">
              {contest.freezeMinutes} minutes before the end
            </span>
          </InfoRow>
        ) : null}
        <InfoRow label="Users">
          <Link href={`/contest/${contest.key}/ranking/`} className="font-mono text-sm tabular-nums">
            {contest.userCount}
          </Link>
        </InfoRow>
        {detail.viewer.requiresAccessCode ? (
          <InfoRow label="Access">An access code is required to join.</InfoRow>
        ) : null}
      </Panel>

      {detail.format.shortFormDisplay.length > 0 ? (
        <Panel title="Scoring" bodyClassName="p-3">
          <ul className="grid gap-2 text-sm text-subtle">
            {detail.format.shortFormDisplay.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {contest.authors.length > 0 || contest.testers.length > 0 || contest.curators.length > 0 ? (
        <Panel title="People" bodyClassName="p-0">
          {contest.authors.length > 0 ? (
            <InfoRow label={contest.authors.length === 1 ? "Author" : "Authors"}>
              <UserList users={contest.authors} />
            </InfoRow>
          ) : null}
          {contest.curators.length > 0 ? (
            <InfoRow label={contest.curators.length === 1 ? "Curator" : "Curators"}>
              <UserList users={contest.curators} />
            </InfoRow>
          ) : null}
          {contest.testers.length > 0 ? (
            <InfoRow label={contest.testers.length === 1 ? "Tester" : "Testers"}>
              <UserList users={contest.testers} />
            </InfoRow>
          ) : null}
        </Panel>
      ) : null}
    </>
  );
}

export function ContestDetailClient({
  contestKey,
  initial,
  descriptionHtml,
  viewerUsername,
}: {
  contestKey: string;
  initial: ContestDetail;
  descriptionHtml: string;
  viewerUsername: string | null;
}) {
  const live = useQuery(api.contests.get, { key: contestKey });
  const detail = live?.contest ? live : initial;
  const contest = detail.contest;
  if (!contest) return null;

  const joinKind = joinKindFor(detail);
  const showProblems =
    detail.timing.ended ||
    detail.viewer.isEditor ||
    detail.viewer.isTester ||
    detail.viewer.canEdit ||
    (detail.viewer.isSpectator && detail.timing.started) ||
    detail.viewer.inContest;
  const showState = detail.viewer.isAuthenticated;
  const precision = contest.pointsPrecision;

  return (
    <>
      <TitleRow
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {contest.name}
            <ContestChips
              isVisible={contest.isVisible}
              isPrivate={contest.isPrivate}
              isOrganizationPrivate={contest.isOrganizationPrivate}
              isRated={contest.isRated}
              organizations={contest.organizations}
              tags={contest.tags}
            />
          </span>
        }
        tabs={contestTabs(detail, contestKey, viewerUsername)}
        active="detail"
        action={
          joinKind ? <JoinControl contestKey={contestKey} kind={joinKind} long size="default" /> : undefined
        }
      />

      <Banner detail={detail} />

      <TwoColumn side={<Sidebar detail={detail} />}>
        <ContentDescription html={descriptionHtml} />

        {showProblems ? (
          <section className="mt-8 grid gap-2">
            <h2 className="flex items-center gap-2 font-display text-h2 font-semibold">
              <CircleHelp size={18} className="text-muted-foreground" aria-hidden />
              Problems
            </h2>
            <Table>
              <TableHeader>
                <TableRow>
                  {showState ? <TableHead className="w-7" /> : null}
                  <TableHead className="w-full">Problem</TableHead>
                  <TableHead numeric>Points</TableHead>
                  {showState ? <TableHead numeric>Your score</TableHead> : null}
                  <TableHead numeric>AC rate</TableHead>
                  <TableHead numeric>Users</TableHead>
                  {detail.metadata.hasPublicEditorials ? <TableHead className="w-8" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.problems.length === 0 ? (
                  <EmptyRow colSpan={7}>This contest has no problems.</EmptyRow>
                ) : (
                  detail.problems.map((problem) => (
                    <ProblemRow
                      key={problem.contestProblemId}
                      problem={problem}
                      contestKey={contestKey}
                      showEditorials={detail.metadata.hasPublicEditorials}
                      showState={showState}
                      ended={detail.timing.ended}
                      precision={precision}
                    />
                  ))
                )}
              </TableBody>
            </Table>
            {detail.timing.ended && showState ? (
              <p className="text-sm text-muted-foreground">
                A tick marks a problem you have solved; hover it to see whether the solve landed during the
                contest or since.
              </p>
            ) : null}
          </section>
        ) : null}

        {contest.useClarifications ? (
          <Clarifications contestKey={contestKey} canPost={detail.viewer.canEdit} problems={detail.problems} />
        ) : null}
      </TwoColumn>
    </>
  );
}
