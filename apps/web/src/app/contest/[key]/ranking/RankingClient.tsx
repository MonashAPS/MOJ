"use client";

import { api } from "@convex/_generated/api";
import type { RankingPayload, RankingRow } from "@convex/contestRankings";
import type { ContestDetail } from "@convex/contests";
import type { FrozenCells } from "@convex/pages/contests";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  cn,
  EmptyState,
  MicroLabel,
  RatingName,
  Select,
  Switch,
  TitleRow,
  Tooltip,
  toast,
} from "@moj/ui";
import { useMutation, useQuery } from "convex/react";
import { Ban, Snowflake, Trophy, Undo2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { JoinControl } from "@/components/contests/JoinControls";
import { ContestChips, humanDuration } from "@/components/contests/pieces";
import { COUNTDOWN_HORIZON, formatDuration, useCountdown } from "@/lib/countdown";
import { formatDateTime, formatPoints } from "@/lib/format";
import { contestTabs, joinKindFor } from "../tabs";

const DASH = "—";
const ALL = "__all__";

/**
 * C1: a window contest's clock is the *participation's*, and the ranking has to
 * say so. `contests.get` carries `timeLimit` and the participation's computed
 * end; `contestRankings.ranking` does not, which is why the page reads both.
 */
function WindowNote({ detail }: { detail: ContestDetail }) {
  const contest = detail.contest;
  const participation = detail.participation ?? detail.liveParticipation;
  const target = participation && !participation.ended ? participation.endsAt : (contest?.endTime ?? null);
  const remaining = useCountdown(detail.timing.ended ? null : target);
  if (!contest) return null;

  const window = contest.timeLimit
    ? `${humanDuration(contest.timeLimit * 1000)} window between ${formatDateTime(contest.startTime)} and ${formatDateTime(contest.endTime)}`
    : null;
  const clock = remaining !== null && remaining <= COUNTDOWN_HORIZON ? formatDuration(remaining) : null;

  if (!window && !clock) return null;
  return (
    <p className="font-mono text-sm tabular-nums text-muted-foreground">
      {clock
        ? participation && !participation.ended
          ? `Your window closes in ${clock}.`
          : `The contest ends in ${clock}.`
        : null}
      {clock && window ? " " : null}
      {window}
    </p>
  );
}

type CellData = NonNullable<RankingRow["problems"][number]>;

/** DMOJ's `<td class>` for a cell, mapped onto DESIGN.md section 16.1's states. */
function cellSkin(state: string): string {
  const base = state.replace("pretest-", "");
  if (base === "full-score") return "bg-(--cell-solved-bg) text-(--cell-solved-ink)";
  if (base === "partial-score") return "bg-warn-bg text-warn";
  if (base === "failed-score") return "bg-(--cell-failed-bg) text-(--cell-failed-ink)";
  return "text-(--cell-empty-ink)";
}

function ProblemCell({
  cell,
  pending,
  precision,
}: {
  cell: CellData | null;
  pending: number;
  precision: number;
}) {
  if (pending > 0) {
    return (
      <td className="h-(--row-h-dense) w-11 min-w-11 border-b border-border bg-(--cell-frozen-bg) px-1 text-center align-middle text-(--cell-frozen-ink)">
        <Tooltip content={`${pending} ${pending === 1 ? "submission" : "submissions"} after the freeze`}>
          <span className="block font-mono text-sm font-medium tabular-nums">
            ?<span className="block text-xs opacity-80">{`-${pending}`}</span>
          </span>
        </Tooltip>
      </td>
    );
  }

  if (!cell) {
    return (
      <td className="h-(--row-h-dense) w-11 min-w-11 border-b border-border px-1 text-center align-middle font-mono text-sm text-(--cell-empty-ink)">
        {DASH}
      </td>
    );
  }

  const isPretest = cell.state.startsWith("pretest-");
  const label = [
    cell.pointsText,
    cell.penaltyText ? `penalty ${cell.penaltyText}` : null,
    cell.bonusText ? `bonus ${cell.bonusText}` : null,
    cell.timeText || null,
    isPretest ? "pretests only" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <td
      className={cn(
        "h-(--row-h-dense) w-11 min-w-11 border-b border-border px-1 text-center align-middle",
        cellSkin(cell.state),
        isPretest && "outline-1 -outline-offset-1 outline-dashed outline-(--line-strong)",
      )}
      title={label}
    >
      <span className="block font-mono text-sm font-medium tabular-nums leading-tight">
        {cell.pointsText || formatPoints(cell.points, precision)}
        {cell.penaltyText ? <span className="opacity-75">{` (${cell.penaltyText})`}</span> : null}
      </span>
      {cell.timeText ? (
        <span className="block font-mono text-xs tabular-nums opacity-75">{cell.timeText}</span>
      ) : null}
    </td>
  );
}

function Row({
  row,
  contestKey,
  problemIds,
  hasRating,
  showOrganizations,
  canDisqualify,
  pendingOf,
  precision,
}: {
  row: RankingRow;
  contestKey: string;
  problemIds: string[];
  hasRating: boolean;
  showOrganizations: boolean;
  canDisqualify: boolean;
  pendingOf: (participationId: string, contestProblemId: string) => number;
  precision: number;
}) {
  const disqualify = useMutation(api.contests.disqualify);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    setBusy(true);
    try {
      await disqualify({
        key: contestKey,
        participationId: row.participationId,
        disqualified: !row.isDisqualified,
      });
      toast.success(row.isDisqualified ? "Participation reinstated" : "Participation disqualified");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr
      data-selected={row.isViewer || undefined}
      className={cn(
        "transition-colors duration-(--dur-fast) hover:bg-row-hover",
        "data-[selected]:bg-row-selected data-[selected]:shadow-[inset_3px_0_0_var(--brand-royal)]",
        row.isDisqualified && "text-muted-foreground line-through decoration-1",
      )}
    >
      {/* `min-w-12` is what actually holds this column at 48px. Auto table
          layout treats a width as a suggestion and shrinks the column to its
          digits, which would leave the frozen name column, pinned at `left-12`,
          floating a few pixels clear of it with the page showing through. */}
      <td className="sticky left-0 z-1 h-(--row-h-dense) w-12 min-w-12 border-b border-border bg-inherit px-3 text-right align-middle font-mono text-sm tabular-nums text-muted-foreground">
        {row.rankLabel}
      </td>
      <td className="sticky left-12 z-1 h-(--row-h-dense) min-w-[180px] whitespace-nowrap border-b border-r border-r-(--line-strong) border-border bg-inherit px-3 align-middle">
        <span className="flex items-center gap-2">
          <RatingName
            username={row.user.username}
            displayName={row.user.displayName}
            rating={row.user.rating}
            href={`/user/${row.user.username}/`}
            isAdmin={row.user.displayRank === "admin"}
            className="text-sm"
          />
          {row.virtual > 0 ? (
            <Badge variant="neutral" shape="square" mono>
              virtual
            </Badge>
          ) : null}
          {row.virtual === -1 ? (
            <Badge variant="neutral" shape="square" mono>
              spectator
            </Badge>
          ) : null}
          {row.isDisqualified ? (
            <Badge variant="bad" shape="square" mono>
              DQ
            </Badge>
          ) : null}
        </span>
      </td>
      {hasRating ? (
        <td className="h-(--row-h-dense) border-b border-border px-3 text-right align-middle font-mono text-sm tabular-nums">
          {row.rating ?? DASH}
        </td>
      ) : null}
      {showOrganizations ? (
        <td className="h-(--row-h-dense) w-full border-b border-border pl-5 pr-3 align-middle">
          <span className="flex flex-wrap items-center gap-1">
            {row.organizations.map((organization) => (
              <Tooltip key={organization._id} content={organization.name}>
                <Link href={`/organization/${organization.slug}/`} className="relative z-1">
                  <Badge variant="outline" shape="square" mono>
                    {organization.shortName || organization.name}
                  </Badge>
                </Link>
              </Tooltip>
            ))}
          </span>
        </td>
      ) : null}
      {row.problems.map((cell, index) => (
        <ProblemCell
          // biome-ignore lint/suspicious/noArrayIndexKey: cells are positional, and a null cell has no id
          key={`${row.participationId}-${index}`}
          cell={cell}
          pending={pendingOf(row.participationId, problemIds[index] ?? "")}
          precision={precision}
        />
      ))}
      <td className="h-(--row-h-dense) border-b border-border px-3 text-right align-middle">
        {row.isDisqualified ? (
          <span className="block font-mono text-sm font-semibold tabular-nums leading-tight text-muted-foreground">
            {DASH}
          </span>
        ) : (
          <>
            <span className="block font-mono text-sm font-semibold tabular-nums leading-tight">
              {row.result.pointsText}
            </span>
            {row.result.cumtimeText ? (
              <span className="block font-mono text-xs tabular-nums text-muted-foreground">
                {row.result.cumtimeText}
              </span>
            ) : null}
          </>
        )}
      </td>
      {canDisqualify ? (
        <td className="h-(--row-h-dense) border-b border-border px-2 text-center align-middle">
          <Tooltip content={row.isDisqualified ? "Reinstate participation" : "Disqualify participation"}>
            <Button
              variant="ghost"
              size="icon-sm"
              busy={busy}
              onClick={toggle}
              aria-label={row.isDisqualified ? "Reinstate participation" : "Disqualify participation"}
            >
              {row.isDisqualified ? <Undo2 size={14} aria-hidden /> : <Ban size={14} aria-hidden />}
            </Button>
          </Tooltip>
        </td>
      ) : null}
    </tr>
  );
}

export function RankingClient({
  contestKey,
  detail,
  initial,
  viewerUsername,
  classOptions,
  initialFrozenCells,
}: {
  contestKey: string;
  detail: ContestDetail;
  initial: RankingPayload;
  viewerUsername: string | null;
  classOptions: { _id: string; name: string }[];
  initialFrozenCells: FrozenCells;
}) {
  const [includeVirtual, setIncludeVirtual] = useState(false);
  const [includeSpectators, setIncludeSpectators] = useState(false);
  const [showOrganizations, setShowOrganizations] = useState(true);
  const [organizationSlug, setOrganizationSlug] = useState(ALL);
  const [classId, setClassId] = useState(ALL);
  const [revealBusy, setRevealBusy] = useState(false);
  const unfreeze = useMutation(api.scoreboard.unfreezeContest);

  const args = {
    key: contestKey,
    includeVirtual,
    includeSpectators,
    ...(organizationSlug !== ALL ? { organizationSlug } : {}),
    ...(classId !== ALL ? { classId: classId as never } : {}),
  };
  const live = useQuery(api.contestRankings.ranking, args);
  const defaults = !includeVirtual && !includeSpectators && organizationSlug === ALL && classId === ALL;
  const data = live ?? (defaults ? initial : null);

  const liveFrozen = useQuery(api.pages.contests.frozenCells, { key: contestKey });
  const frozen = liveFrozen === undefined ? initialFrozenCells : liveFrozen;
  const pendingMap = new Map<string, number>();
  for (const cell of frozen?.cells ?? []) {
    pendingMap.set(`${cell.participationId}|${cell.contestProblemId}`, cell.pending);
  }
  const pendingOf = (participationId: string, contestProblemId: string) =>
    pendingMap.get(`${participationId}|${contestProblemId}`) ?? 0;

  const joinKind = joinKindFor(detail);
  const contest = detail.contest;
  const precision = contest?.pointsPrecision ?? 2;

  const organizationOptions = [
    { value: ALL, label: "All organizations" },
    ...[
      ...new Map(
        (data?.rows ?? [])
          .flatMap((row) => row.organizations)
          .map((organization) => [organization.slug, organization] as const),
      ).values(),
    ].map((organization) => ({ value: organization.slug, label: organization.name })),
  ];

  const toggleReveal = async (revealed: boolean) => {
    setRevealBusy(true);
    try {
      await unfreeze({ key: contestKey, revealed });
      toast.success(revealed ? "Scoreboard revealed" : "Scoreboard frozen again");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That did not work.");
    } finally {
      setRevealBusy(false);
    }
  };

  const problemIds = (data?.problems ?? []).map((problem) => problem.contestProblemId as string);
  // An organisation column nobody is in is 300px of nothing; DMOJ hides it too.
  const anyOrganizations = (data?.rows ?? []).some((row) => row.organizations.length > 0);
  const organizationColumn = anyOrganizations && showOrganizations;

  return (
    <>
      <TitleRow
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {contest?.name ?? "Rankings"}
            {contest ? (
              <ContestChips
                isVisible={contest.isVisible}
                isPrivate={contest.isPrivate}
                isOrganizationPrivate={contest.isOrganizationPrivate}
                isRated={contest.isRated}
                organizations={contest.organizations}
                tags={contest.tags}
              />
            ) : null}
          </span>
        }
        tabs={contestTabs(detail, contestKey, viewerUsername)}
        active="ranking"
        action={
          joinKind ? <JoinControl contestKey={contestKey} kind={joinKind} long size="default" /> : undefined
        }
      />

      {data === null || data === undefined ? (
        data === null ? (
          <EmptyState
            icon={<Trophy aria-hidden />}
            title="Rankings are hidden"
            description="The scoreboard for this contest is not visible to you yet."
          />
        ) : null
      ) : (
        <div className="grid min-w-0 gap-4">
          {data.isFrozen ? (
            <Alert variant="info">
              <Snowflake size={16} aria-hidden />
              <AlertTitle>The scoreboard is frozen</AlertTitle>
              <AlertDescription>
                {frozen
                  ? `Submissions made after ${formatDateTime(frozen.frozenAt)} are withheld until the contest is revealed.`
                  : "Submissions made after the freeze point are withheld until the contest is revealed."}
              </AlertDescription>
            </Alert>
          ) : null}

          {!data.canSeeFullScoreboard ? (
            <Alert variant="info">
              <AlertTitle>Only your own row is shown</AlertTitle>
              <AlertDescription>
                This contest hides the full scoreboard until your window is over.
              </AlertDescription>
            </Alert>
          ) : null}

          <WindowNote detail={detail} />

          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <Switch label="Include virtual" checked={includeVirtual} onCheckedChange={setIncludeVirtual} />
              <Switch
                label="Include spectators"
                aria-label="Include spectators"
                checked={includeSpectators}
                onCheckedChange={setIncludeSpectators}
              />
              {anyOrganizations ? (
                <Switch
                  label="Show organizations"
                  aria-label="Show organizations"
                  checked={showOrganizations}
                  onCheckedChange={setShowOrganizations}
                />
              ) : null}
            </div>

            <div className="flex flex-wrap items-end gap-3">
              {organizationOptions.length > 1 ? (
                <div className="grid gap-1">
                  <MicroLabel>Organization</MicroLabel>
                  <Select
                    ariaLabel="Filter by organization"
                    size="sm"
                    options={organizationOptions}
                    value={organizationSlug}
                    onValueChange={setOrganizationSlug}
                  />
                </div>
              ) : null}
              {classOptions.length > 0 ? (
                <div className="grid gap-1">
                  <MicroLabel>Class</MicroLabel>
                  <Select
                    ariaLabel="Filter by class"
                    size="sm"
                    options={[
                      { value: ALL, label: "All classes" },
                      ...classOptions.map((klass) => ({ value: klass._id, label: klass.name })),
                    ]}
                    value={classId}
                    onValueChange={setClassId}
                  />
                </div>
              ) : null}
              {detail.viewer.canEdit && contest && contest.freezeMinutes > 0 ? (
                <Button
                  variant="secondary"
                  size="sm"
                  busy={revealBusy}
                  onClick={() => toggleReveal(!data.isRevealed)}
                >
                  {data.isRevealed ? "Freeze scoreboard" : "Reveal scoreboard"}
                </Button>
              ) : null}
            </div>
          </div>

          {data.rows.length === 0 ? (
            <EmptyState
              icon={<Trophy aria-hidden />}
              title="Nobody yet"
              description="No one has taken part in this contest."
            />
          ) : (
            <div className="overflow-hidden overflow-x-auto rounded-md border border-border bg-card">
              <table className="w-full border-collapse text-base [&_tbody_tr:nth-child(even):not(:hover):not([data-selected])]:bg-zebra [&_tbody_tr:last-child_td]:border-b-0">
                <thead>
                  {/* The band carries the navy itself so the seam between the two
                      frozen cells stays navy rather than flashing the card. */}
                  <tr className="bg-titlebar">
                    <th className="sticky left-0 z-2 h-8 w-12 min-w-12 whitespace-nowrap bg-titlebar px-3 text-right align-middle font-sans text-xs font-semibold uppercase leading-none tracking-label text-titlebar-ink">
                      #
                    </th>
                    <th className="sticky left-12 z-2 h-8 min-w-[180px] whitespace-nowrap border-r border-r-(--line-strong) bg-titlebar px-3 text-left align-middle font-sans text-xs font-semibold uppercase leading-none tracking-label text-titlebar-ink">
                      User
                    </th>
                    {data.hasRating ? (
                      <th className="h-8 whitespace-nowrap bg-titlebar px-3 text-right align-middle font-sans text-xs font-semibold uppercase leading-none tracking-label text-titlebar-ink">
                        Rating
                      </th>
                    ) : null}
                    {organizationColumn ? (
                      <th className="h-8 w-full whitespace-nowrap bg-titlebar pl-5 pr-3 text-left align-middle font-sans text-xs font-semibold uppercase leading-none tracking-label text-titlebar-ink">
                        Organization
                      </th>
                    ) : null}
                    {data.problems.map((problem) => (
                      <th
                        key={problem.contestProblemId}
                        className="h-8 w-11 min-w-11 bg-titlebar px-1 text-center align-middle font-sans text-xs font-semibold uppercase leading-none tracking-label text-titlebar-ink"
                      >
                        <Link
                          href={`/contest/${contestKey}/rank/${problem.code}/`}
                          title={problem.name}
                          className="block text-titlebar-ink hover:text-white"
                        >
                          <span className="block font-mono text-sm">{problem.label}</span>
                          <span className="block font-mono text-xs font-normal normal-case tracking-normal text-titlebar-ink-2">
                            {formatPoints(problem.points, precision)}
                          </span>
                        </Link>
                      </th>
                    ))}
                    <th className="h-8 whitespace-nowrap bg-titlebar px-3 text-right align-middle font-sans text-xs font-semibold uppercase leading-none tracking-label text-titlebar-ink">
                      Total
                    </th>
                    {data.canDisqualify ? (
                      <th className="h-8 w-10 bg-titlebar px-2 text-center align-middle font-sans text-xs font-semibold uppercase leading-none tracking-label text-titlebar-ink">
                        <span className="sr-only">Actions</span>
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <Row
                      key={row.participationId}
                      row={row}
                      contestKey={contestKey}
                      problemIds={problemIds}
                      hasRating={data.hasRating}
                      showOrganizations={organizationColumn}
                      canDisqualify={data.canDisqualify}
                      pendingOf={pendingOf}
                      precision={precision}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            {data.totalRows === 1 ? "1 participation" : `${data.totalRows} participations`}
          </p>
        </div>
      )}
    </>
  );
}
