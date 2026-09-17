"use client";

import type { RankingPayload, RankingProblem, RankingRow } from "@convex/contests/rankings";
import { cn } from "@moj/ui";
import { Medal } from "lucide-react";
import { useTranslations } from "next-intl";
import { RankingCellSubmissions } from "@/components/contests/RankingCellSubmissions";
import { balloonFor } from "@/lib/balloon";
import { type BoardCell, boardStandings, isSolved, minutesOf, triesOf } from "@/lib/domjudge-board";

/**
 * The scoreboard as DOMjudge draws it.
 *
 * Not ours repainted: the contest's name sits in a strip of its own with the
 * state of the results at the other end, the table is centred rather than
 * bled to the window, the rank column hangs a medal on the first three, the
 * team's affiliation sits under its name, the score is problems solved beside
 * penalty minutes, and every problem's column is headed by its balloon.
 *
 * A cell is the minute the problem went out and how many attempts it took —
 * green for solved, the darker green for whoever got there first, red for tried
 * and not solved, yellow for pending. All of that is arithmetic over the rows on
 * screen, in `@/lib/domjudge-board`.
 */

const CELL = "w-[74px] min-w-[74px] border border-border p-0 text-center align-middle";

const HEAD =
  "whitespace-nowrap border border-border bg-(--board-head) px-2 py-1 text-center align-middle " +
  "font-sans text-sm font-bold text-foreground";

const MEDALS = ["var(--medal-gold)", "var(--medal-silver)", "var(--medal-bronze)"];

function BalloonHead({ problem }: { problem: RankingProblem }) {
  const balloon = balloonFor(problem.code);

  return (
    <span
      title={problem.name}
      className="mx-auto flex size-7 items-center justify-center rounded-(--radius-sm) border font-mono text-sm font-bold text-[color:hsl(0_0%_12%)]"
      style={{ backgroundColor: balloon.fill, borderColor: balloon.line }}
    >
      {problem.label}
    </span>
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
          <span className="block py-0.5 font-mono text-base font-bold leading-tight tabular-nums">
            ?
            <span className="block font-sans text-xs font-normal">{t("boardTries", { count: pending })}</span>
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
        <span className="block py-0.5 font-mono text-base font-bold leading-tight tabular-nums">
          {minutes !== null ? minutes : cell.pointsText}
          <span className="block font-sans text-xs font-normal">
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
  ended,
}: {
  data: NonNullable<RankingPayload>;
  contestKey: string;
  precision: number;
  pendingOf: (participationId: string, contestProblemId: string) => number;
  ended: boolean;
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

  const state = data.isFrozen ? t("boardPreliminary") : ended ? t("boardFinal") : null;

  return (
    <div className="grid min-w-0 gap-4">
      {/* DOMjudge writes the contest across a strip of its own, with what the
          results are worth at the other end of it. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-y border-border bg-secondary px-3 py-2">
        <span className="font-display text-h3 font-semibold">{data.contest.name}</span>
        {state ? <span className="text-base text-muted-foreground">{state}</span> : null}
      </div>

      <div className="overflow-x-auto">
        <table className="mx-auto border-collapse text-base">
          <thead>
            <tr>
              <th className={HEAD}>{t("boardRank")}</th>
              <th className={cn(HEAD, "min-w-[280px]")}>{t("boardTeam")}</th>
              <th className={HEAD} colSpan={2}>
                {t("boardScore")}
              </th>
              {data.problems.map((problem) => (
                <th key={problem.contestProblemId} className={cn(HEAD, "w-[74px] min-w-[74px] px-1")}>
                  <BalloonHead problem={problem} />
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {data.rows.map((row, index) => {
              // A rank equal to the row above is left blank, which is what makes
              // a tie readable at a glance.
              const tied = index > 0 && data.rows[index - 1]?.rankLabel === row.rankLabel;
              const medal = !tied && row.rank !== null && row.rank <= 3 ? MEDALS[row.rank - 1] : undefined;

              return (
                <tr
                  key={row.participationId}
                  className={cn(
                    "bg-(--board-row)",
                    row.isDisqualified && "text-muted-foreground line-through decoration-1",
                  )}
                >
                  <td className="w-16 min-w-16 border border-border px-2 text-center align-middle font-mono text-base font-bold tabular-nums">
                    <span className="flex items-center justify-center gap-1">
                      {medal ? <Medal size={16} aria-hidden style={{ color: medal }} /> : null}
                      {tied ? "" : row.rankLabel}
                    </span>
                  </td>
                  <td className="border border-border px-2 py-1 text-right align-middle">
                    <span className="block font-semibold leading-tight">
                      {row.user.displayName || row.user.username}
                    </span>
                    {row.organizations.length > 0 ? (
                      <span className="block text-xs leading-tight text-muted-foreground">
                        {row.organizations.map((organization) => organization.name).join(", ")}
                      </span>
                    ) : null}
                  </td>
                  <td className="w-12 min-w-12 border border-border px-2 text-center align-middle font-mono text-base font-bold tabular-nums">
                    {row.result.pointsText}
                  </td>
                  <td className="w-16 min-w-16 border border-border px-2 text-center align-middle font-mono text-base tabular-nums">
                    {row.result.cumtimeText}
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
              <td className="border border-border" />
              <td className="border border-border px-2 py-1 text-right align-middle font-semibold">
                {t("boardSummary")}
              </td>
              <td className="border border-border" colSpan={2} />
              {standings.map((standing, column) => (
                <td
                  key={data.problems[column]?.contestProblemId ?? column}
                  className="border border-border px-1 py-1 text-center align-middle"
                  title={t("boardSummaryCell", { solved: standing.solved, tried: standing.tried })}
                >
                  <span className="block font-mono text-base font-bold leading-tight tabular-nums text-good">
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

      <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
        {[
          { key: "first", fill: "bg-(--cell-first-bg)", label: "boardLegendFirst" },
          { key: "solved", fill: "bg-(--cell-solved-bg)", label: "boardLegendSolved" },
          { key: "tried", fill: "bg-(--cell-failed-bg)", label: "boardLegendTried" },
          { key: "pending", fill: "bg-(--cell-judging-bg)", label: "boardLegendPending" },
        ].map((entry) => (
          <li key={entry.key} className="flex items-center gap-1.5">
            <span aria-hidden className={cn("size-4 rounded-xs border border-border", entry.fill)} />
            {t(entry.label)}
          </li>
        ))}
      </ul>
    </div>
  );
}
