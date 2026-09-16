"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { ContestDetail } from "@convex/contests";
import type { RankingPayload, RankingProblem, RankingRow } from "@convex/contests/rankings";
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
import type { FunctionArgs } from "convex/server";
import { Ban, Snowflake, Trophy, Undo2 } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { JoinControl } from "@/components/contests/JoinControls";
import { ContestChips, useHumanDuration } from "@/components/contests/pieces";
import { RankingCellSubmissions } from "@/components/contests/RankingCellSubmissions";
import { chosenValue } from "@/lib/choices";
import { COUNTDOWN_HORIZON, formatDuration, useCountdown } from "@/lib/countdown";
import { formatDateTime, formatPoints } from "@/lib/format";
import { contestTabs, joinKindFor } from "../tabs";

const DASH = "—";

const ALL = "__all__";

/**
 * C1: a window contest's clock is the *participation's*, and the ranking has to
 * say so. `contests.get` carries `timeLimit` and the participation's computed
 * end; `contests/rankings.ranking` does not, which is why the page reads both.
 */
function WindowNote({ detail }: { detail: ContestDetail }) {
  const t = useTranslations("contests.ranking");
  const duration = useTranslations("contests.duration");
  const humanDuration = useHumanDuration();
  const contest = detail.contest;
  const participation = detail.participation ?? detail.liveParticipation;
  const target = participation && !participation.ended ? participation.endsAt : (contest?.endTime ?? null);
  const remaining = useCountdown(detail.timing.ended ? null : target);

  if (!contest) return null;

  const window = contest.timeLimit
    ? duration("windowBetween", {
        duration: humanDuration(contest.timeLimit * 1000),
        start: formatDateTime(contest.startTime),
        end: formatDateTime(contest.endTime),
      })
    : null;

  const clock = remaining !== null && remaining <= COUNTDOWN_HORIZON ? formatDuration(remaining) : null;

  if (!window && !clock) return null;

  return (
    <p className="font-mono text-sm tabular-nums text-muted-foreground">
      {clock
        ? participation && !participation.ended
          ? t("windowClosesIn", { time: clock })
          : t("contestEndsIn", { time: clock })
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
  contestKey,
  user,
  problem,
}: {
  cell: CellData | null;
  pending: number;
  precision: number;
  contestKey: string;
  user: RankingRow["user"];
  problem: RankingProblem;
}) {
  const t = useTranslations("contests.ranking");

  // Every cell that stands for an attempt opens the attempts behind it, the
  // frozen one included: a '?' is the cell a reader most wants unfolded.
  const attempts = (children: ReactNode, tooltip?: ReactNode) => (
    <RankingCellSubmissions
      contestKey={contestKey}
      username={user.username}
      displayName={user.displayName || user.username}
      problem={problem}
      precision={precision}
      tooltip={tooltip}
    >
      {children}
    </RankingCellSubmissions>
  );

  if (pending > 0) {
    return (
      <td className="h-(--row-h-dense) w-11 min-w-11 border-b border-border bg-(--cell-frozen-bg) p-0 text-center align-middle text-(--cell-frozen-ink)">
        {attempts(
          <span className="block font-mono text-sm font-medium tabular-nums">
            ?<span className="block text-xs opacity-80">{`-${pending}`}</span>
          </span>,
          t("pendingAfterFreeze", { count: pending }),
        )}
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
    cell.penaltyText ? t("penalty", { value: cell.penaltyText }) : null,
    cell.bonusText ? t("bonus", { value: cell.bonusText }) : null,
    cell.timeText || null,
    isPretest ? t("pretestsOnly") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <td
      className={cn(
        "h-(--row-h-dense) w-11 min-w-11 border-b border-border p-0 text-center align-middle",
        cellSkin(cell.state),
        isPretest && "outline-1 -outline-offset-1 outline-dashed outline-(--line-strong)",
      )}
      title={label}
    >
      {attempts(
        <>
          <span className="block font-mono text-sm font-medium tabular-nums leading-tight">
            {cell.pointsText || formatPoints(cell.points, precision)}
            {cell.penaltyText ? <span className="opacity-75">{` (${cell.penaltyText})`}</span> : null}
          </span>
          {cell.timeText ? (
            <span className="block font-mono text-xs tabular-nums opacity-75">{cell.timeText}</span>
          ) : null}
        </>,
      )}
    </td>
  );
}

function Row({
  row,
  contestKey,
  problems,
  hasRating,
  showOrganizations,
  canDisqualify,
  pendingOf,
  precision,
}: {
  row: RankingRow;
  contestKey: string;
  problems: RankingProblem[];
  hasRating: boolean;
  showOrganizations: boolean;
  canDisqualify: boolean;
  pendingOf: (participationId: string, contestProblemId: string) => number;
  precision: number;
}) {
  const t = useTranslations("contests.ranking");
  const disqualify = useMutation(api.contests.participation.disqualify);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    setBusy(true);

    try {
      await disqualify({
        key: contestKey,
        participationId: row.participationId,
        disqualified: !row.isDisqualified,
      });
      toast.success(row.isDisqualified ? t("reinstated") : t("disqualified"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("didNotWork"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr
      data-selected={row.isViewer || undefined}
      className={cn(
        // The frozen cells take their colour from the row with `bg-inherit`, so
        // the row has to have one. Without this only the striped rows were
        // opaque and the scrolling columns slid under the odd-numbered names.
        "bg-card transition-colors duration-(--dur-fast) hover:bg-row-hover",
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
      <td className="sticky left-12 z-1 h-(--row-h-dense) min-w-[180px] whitespace-nowrap border-b border-border bg-inherit px-3 align-middle shadow-[inset_-1px_0_0_0_var(--line-strong)]">
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
            <Badge variant="neutral" rounding="square" mono>
              {t("virtualBadge")}
            </Badge>
          ) : null}
          {row.virtual === -1 ? (
            <Badge variant="neutral" rounding="square" mono>
              {t("spectatorBadge")}
            </Badge>
          ) : null}
          {row.isDisqualified ? (
            <Badge variant="bad" rounding="square" mono>
              {t("disqualifiedBadge")}
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
                  <Badge variant="outline" rounding="square" mono>
                    {organization.shortName || organization.name}
                  </Badge>
                </Link>
              </Tooltip>
            ))}
          </span>
        </td>
      ) : null}
      {/* A row's cells are the contest's problems in order, so the column is what
          identifies a cell — a null one has no id of its own. */}
      {problems.map((problem, index) => (
        <ProblemCell
          key={problem.contestProblemId}
          cell={row.problems[index] ?? null}
          pending={pendingOf(row.participationId, problem.contestProblemId)}
          precision={precision}
          contestKey={contestKey}
          user={row.user}
          problem={problem}
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
          <Tooltip content={row.isDisqualified ? t("reinstate") : t("disqualify")}>
            <Button
              variant="ghost"
              size="icon-sm"
              busy={busy}
              onClick={toggle}
              aria-label={row.isDisqualified ? t("reinstate") : t("disqualify")}
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
  classOptions,
  initialFrozenCells,
}: {
  contestKey: string;
  detail: ContestDetail;
  initial: RankingPayload;
  classOptions: { _id: Id<"classes">; name: string }[];
  initialFrozenCells: FrozenCells;
}) {
  const t = useTranslations("contests.ranking");
  const columns = useTranslations("contests.columns");
  const tabLabels = useTranslations("contests.tabs");
  const [includeVirtual, setIncludeVirtual] = useState(false);
  const [includeSpectators, setIncludeSpectators] = useState(false);
  const [showOrganizations, setShowOrganizations] = useState(true);
  const [organizationSlug, setOrganizationSlug] = useState(ALL);
  const [classId, setClassId] = useState<Id<"classes"> | typeof ALL>(ALL);
  const [revealBusy, setRevealBusy] = useState(false);
  const unfreeze = useMutation(api.scoreboard.unfreezeContest);

  const args: FunctionArgs<typeof api.contests.rankings.ranking> = {
    key: contestKey,
    includeVirtual,
    includeSpectators,
  };

  if (organizationSlug !== ALL) args.organizationSlug = organizationSlug;

  if (classId !== ALL) args.classId = classId;

  const live = useQuery(api.contests.rankings.ranking, args);
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

  const classIdOptions: { value: Id<"classes"> | typeof ALL; label: string }[] = [
    { value: ALL, label: t("allClasses") },
    ...classOptions.map((klass) => ({ value: klass._id, label: klass.name })),
  ];

  const organizationOptions = [
    { value: ALL, label: t("allOrganizations") },
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
      toast.success(revealed ? t("revealed") : t("frozenAgain"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("didNotWork"));
    } finally {
      setRevealBusy(false);
    }
  };

  // An organisation column nobody is in is 300px of nothing; DMOJ hides it too.
  const anyOrganizations = (data?.rows ?? []).some((row) => row.organizations.length > 0);
  const organizationColumn = anyOrganizations && showOrganizations;

  return (
    <>
      <TitleRow
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {contest?.name ?? t("metaFallback")}
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
        tabs={contestTabs(detail, contestKey, tabLabels)}
        active="ranking"
        action={
          joinKind ? <JoinControl contestKey={contestKey} kind={joinKind} long size="default" /> : undefined
        }
      />

      {data === null || data === undefined ? (
        data === null ? (
          <EmptyState icon={<Trophy aria-hidden />} title={t("hiddenTitle")} description={t("hiddenBody")} />
        ) : null
      ) : (
        <div className="grid min-w-0 gap-4">
          {data.isFrozen ? (
            <Alert variant="info">
              <Snowflake size={16} aria-hidden />
              <AlertTitle>{t("frozenTitle")}</AlertTitle>
              <AlertDescription>
                {frozen ? t("frozenBody", { time: formatDateTime(frozen.frozenAt) }) : t("frozenBodyUnknown")}
              </AlertDescription>
            </Alert>
          ) : null}

          {!data.canSeeFullScoreboard ? (
            <Alert variant="info">
              <AlertTitle>{t("ownRowTitle")}</AlertTitle>
              <AlertDescription>{t("ownRowBody")}</AlertDescription>
            </Alert>
          ) : null}

          <WindowNote detail={detail} />

          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <Switch
                label={t("includeVirtual")}
                checked={includeVirtual}
                onCheckedChange={setIncludeVirtual}
              />
              <Switch
                label={t("includeSpectators")}
                aria-label={t("includeSpectators")}
                checked={includeSpectators}
                onCheckedChange={setIncludeSpectators}
              />
              {anyOrganizations ? (
                <Switch
                  label={t("showOrganizations")}
                  aria-label={t("showOrganizations")}
                  checked={showOrganizations}
                  onCheckedChange={setShowOrganizations}
                />
              ) : null}
            </div>

            <div className="flex flex-wrap items-end gap-3">
              {organizationOptions.length > 1 ? (
                <div className="grid gap-1">
                  <MicroLabel>{columns("organization")}</MicroLabel>
                  <Select
                    ariaLabel={t("filterByOrganization")}
                    size="sm"
                    options={organizationOptions}
                    value={organizationSlug}
                    onValueChange={setOrganizationSlug}
                  />
                </div>
              ) : null}
              {classOptions.length > 0 ? (
                <div className="grid gap-1">
                  <MicroLabel>{t("class")}</MicroLabel>
                  <Select
                    ariaLabel={t("filterByClass")}
                    size="sm"
                    options={classIdOptions.map((option) => ({
                      value: option.value,
                      label: option.label,
                    }))}
                    value={classId}
                    onValueChange={(value) => setClassId(chosenValue(classIdOptions, value, ALL))}
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
                  {data.isRevealed ? t("freezeScoreboard") : t("revealScoreboard")}
                </Button>
              ) : null}
            </div>
          </div>

          {data.rows.length === 0 ? (
            <EmptyState
              icon={<Trophy aria-hidden />}
              title={t("nobodyTitle")}
              description={t("nobodyBody")}
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
                    <th className="sticky left-12 z-2 h-8 min-w-[180px] whitespace-nowrap bg-titlebar px-3 text-left align-middle font-sans text-xs font-semibold uppercase leading-none tracking-label text-titlebar-ink shadow-[inset_-1px_0_0_0_var(--line-strong)]">
                      {columns("user")}
                    </th>
                    {data.hasRating ? (
                      <th className="h-8 whitespace-nowrap bg-titlebar px-3 text-right align-middle font-sans text-xs font-semibold uppercase leading-none tracking-label text-titlebar-ink">
                        {columns("rating")}
                      </th>
                    ) : null}
                    {organizationColumn ? (
                      <th className="h-8 w-full whitespace-nowrap bg-titlebar pl-5 pr-3 text-left align-middle font-sans text-xs font-semibold uppercase leading-none tracking-label text-titlebar-ink">
                        {columns("organization")}
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
                      {columns("total")}
                    </th>
                    {data.canDisqualify ? (
                      <th className="h-8 w-10 bg-titlebar px-2 text-center align-middle font-sans text-xs font-semibold uppercase leading-none tracking-label text-titlebar-ink">
                        <span className="sr-only">{columns("actions")}</span>
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
                      problems={data.problems}
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

          <p className="text-sm text-muted-foreground">{t("participations", { count: data.totalRows })}</p>
        </div>
      )}
    </>
  );
}
