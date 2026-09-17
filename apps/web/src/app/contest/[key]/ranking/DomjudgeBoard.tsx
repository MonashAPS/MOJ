"use client";

import type { RankingPayload, RankingProblem, RankingRow } from "@convex/contests/rankings";
import { cn } from "@moj/ui";
import { useTranslations } from "next-intl";
import { RankingCellSubmissions } from "@/components/contests/RankingCellSubmissions";
import { COUNTDOWN_HORIZON, useCountdown } from "@/lib/countdown";
import { type BoardCell, boardStandings, isSolved, minutesOf, triesOf } from "@/lib/domjudge-board";

/**
 * The scoreboard as DOMjudge draws it.
 *
 * DOMjudge's board is not ours with different colours: the score is a count of
 * problems and a penalty in minutes rather than points, a cell says how many
 * attempts it took and at what minute rather than what it scored, the team's
 * affiliation sits under its name, the brightest green is reserved for whoever
 * got a problem out first, and the table ends with a row saying how many teams
 * managed each one. That is the whole difference, and this is it.
 *
 * It reads the same payload the house board does. Everything DOMjudge shows
 * that we do not store — the attempt counts, first blood, the summary — is
 * arithmetic over the rows on screen, in `@/lib/domjudge-board`.
 */

const CELL = "h-9 w-14 min-w-14 border border-border p-0 text-center align-middle";

const HEAD =
  "h-8 whitespace-nowrap border border-border bg-secondary px-2 text-center align-middle " +
  "font-sans text-xs font-bold uppercase tracking-normal text-foreground";

/** The four cell states DOMjudge paints, and the legend under the board. */
const LEGEND = [
  { key: "first", fill: "bg-(--cell-first-bg) text-(--cell-first-ink)", label: "boardLegendFirst" },
  { key: "solved", fill: "bg-(--cell-solved-bg) text-(--cell-solved-ink)", label: "boardLegendSolved" },
  { key: "tried", fill: "bg-(--cell-failed-bg) text-(--cell-failed-ink)", label: "boardLegendTried" },
  { key: "pending", fill: "bg-(--cell-judging-bg) text-(--cell-judging-ink)", label: "boardLegendPending" },
] as const;

/** DOMjudge runs a bar across the top of the board while the clock is going. */
function ContestProgress({ startTime, endTime }: { startTime: number; endTime: number }) {
  const t = useTranslations("contests.ranking");
  const remaining = useCountdown(endTime);
  const total = endTime - startTime;

  // An open-ended contest has no bar to draw: it would sit at nothing for years.
  if (total <= 0 || total > COUNTDOWN_HORIZON) return null;

  const left = remaining ?? 0;
  const elapsed = Math.min(Math.max(total - left, 0), total);
  const minutes = Math.floor(elapsed / 60_000);
  const over = left <= 0;

  return (
    <div className="grid gap-1">
      <div className="h-4 w-full overflow-hidden rounded-xs border border-border bg-secondary">
        <div
          className="h-full bg-primary transition-[width] duration-(--dur)"
          style={{ width: `${((elapsed / total) * 100).toFixed(2)}%` }}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        {over ? t("boardOver") : t("boardElapsed", { count: minutes })}
      </p>
    </div>
  );
}

function BoardCellView({
  cell,
  pending,
  isFirst,
  contestKey,
  user,
  problem,
  precision,
}: {
  cell: BoardCell | null;
  pending: number;
  isFirst: boolean;
  contestKey: string;
  user: RankingRow["user"];
  problem: RankingProblem;
  precision: number;
}) {
  const t = useTranslations("contests.ranking");

  const wrap = (children: React.ReactNode, tooltip?: React.ReactNode) => (
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
      <td className={cn(CELL, "bg-(--cell-judging-bg) text-(--cell-judging-ink)")}>
        {wrap(
          <span className="block font-mono text-sm font-bold leading-tight tabular-nums">
            ?<span className="block text-xs font-normal">{t("boardTries", { count: pending })}</span>
          </span>,
          t("pendingAfterFreeze", { count: pending }),
        )}
      </td>
    );
  }

  if (!cell) return <td className={CELL} />;

  const solved = isSolved(cell.state);
  const tries = triesOf(cell);
  const minutes = solved ? minutesOf(cell.timeText) : null;

  return (
    <td
      className={cn(
        CELL,
        solved
          ? isFirst
            ? "bg-(--cell-first-bg) text-(--cell-first-ink)"
            : "bg-(--cell-solved-bg) text-(--cell-solved-ink)"
          : "bg-(--cell-failed-bg) text-(--cell-failed-ink)",
      )}
    >
      {wrap(
        <span className="block font-mono text-sm font-bold leading-tight tabular-nums">
          {minutes !== null ? minutes : cell.pointsText}
          <span className="block text-xs font-normal">
            {tries === null ? cell.timeText : t("boardTries", { count: tries })}
          </span>
        </span>,
      )}
    </td>
  );
}

export function DomjudgeBoard({
  data,
  contestKey,
  precision,
  pendingOf,
}: {
  data: NonNullable<RankingPayload>;
  contestKey: string;
  precision: number;
  pendingOf: (participationId: string, contestProblemId: string) => number;
}) {
  const t = useTranslations("contests.ranking");

  const standings = boardStandings(
    data.rows.map((row) => ({
      participationId: row.participationId,
      isDisqualified: row.isDisqualified,
      problems: row.problems,
    })),
    data.problems.length,
  );

  return (
    <div className="grid min-w-0 gap-3">
      <ContestProgress startTime={data.contest.startTime} endTime={data.contest.endTime} />

      <div className="overflow-x-auto">
        <table className="w-full border-collapse border-spacing-0 text-base">
          <thead>
            <tr>
              <th className={HEAD}>{t("boardRank")}</th>
              <th className={cn(HEAD, "w-full text-left")}>{t("boardTeam")}</th>
              <th className={HEAD}>{t("boardScore")}</th>
              {data.problems.map((problem) => (
                <th key={problem.contestProblemId} className={HEAD} title={problem.name}>
                  {problem.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {data.rows.map((row, index) => {
              // DOMjudge leaves the rank off a row that ties with the one above,
              // which is what makes a tie readable at a glance.
              const tied = index > 0 && data.rows[index - 1]?.rankLabel === row.rankLabel;

              return (
                <tr
                  key={row.participationId}
                  data-selected={row.isViewer || undefined}
                  className={cn(
                    "bg-card",
                    "data-[selected]:bg-row-selected",
                    row.isDisqualified && "text-muted-foreground line-through decoration-1",
                  )}
                >
                  <td className="h-9 w-12 min-w-12 border border-border px-2 text-center align-middle font-mono text-sm font-bold tabular-nums">
                    {tied ? "" : row.rankLabel}
                  </td>
                  <td className="h-9 border border-border px-2 align-middle">
                    <span className="block truncate text-sm font-semibold">
                      {row.user.displayName || row.user.username}
                    </span>
                    {row.organizations.length > 0 ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {row.organizations.map((organization) => organization.name).join(", ")}
                      </span>
                    ) : null}
                  </td>
                  <td className="h-9 w-20 min-w-20 border border-border px-2 text-center align-middle">
                    <span className="font-mono text-sm font-bold tabular-nums">{row.result.pointsText}</span>
                    {row.result.cumtimeText ? (
                      <span className="ml-1.5 font-mono text-xs tabular-nums text-muted-foreground">
                        {row.result.cumtimeText}
                      </span>
                    ) : null}
                  </td>
                  {data.problems.map((problem, column) => (
                    <BoardCellView
                      key={problem.contestProblemId}
                      cell={row.problems[column] ?? null}
                      pending={pendingOf(row.participationId, problem.contestProblemId)}
                      isFirst={standings[column]?.firstParticipationId === row.participationId}
                      contestKey={contestKey}
                      user={row.user}
                      problem={problem}
                      precision={precision}
                    />
                  ))}
                </tr>
              );
            })}
          </tbody>

          {/* DOMjudge closes the board with what the field made of each problem. */}
          <tfoot>
            <tr>
              <td className="h-8 border border-border" />
              <td className="h-8 border border-border px-2 text-right align-middle text-sm font-semibold">
                {t("boardSummary")}
              </td>
              <td className="h-8 border border-border" />
              {standings.map((standing, column) => (
                <td
                  key={data.problems[column]?.contestProblemId ?? column}
                  className="h-8 border border-border px-1 text-center align-middle"
                  title={t("boardSummaryCell", { solved: standing.solved, tried: standing.tried })}
                >
                  <span className="block font-mono text-sm font-bold leading-tight tabular-nums text-good">
                    {standing.solved}
                  </span>
                  <span className="block font-mono text-xs leading-tight tabular-nums text-muted-foreground">
                    {standing.tried}
                  </span>
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {LEGEND.map((entry) => (
          <li key={entry.key} className="flex items-center gap-1.5">
            <span aria-hidden className={cn("size-4 rounded-xs border border-border", entry.fill)} />
            {t(entry.label)}
          </li>
        ))}
      </ul>
    </div>
  );
}
