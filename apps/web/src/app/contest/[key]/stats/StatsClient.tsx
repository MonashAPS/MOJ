"use client";

import { api } from "@convex/_generated/api";
import type { ContestDetail, ContestStats } from "@convex/contests";
import { cn, EmptyState, Panel, TitleRow, Tooltip, type VerdictTone, verdictTone } from "@moj/ui";
import { useQuery } from "convex/react";
import { PieChart } from "lucide-react";
import { JoinControl } from "@/components/contests/JoinControls";
import { ContestChips } from "@/components/contests/pieces";
import { contestTabs, joinKindFor } from "../tabs";

/** The verdict families are the product's reserved status palette; a stacked bar
 *  of verdicts is the one place they are a series, and every segment carries its
 *  code in the legend so nothing is colour alone. */
const TONE_FILL: Record<VerdictTone, string> = {
  good: "bg-good",
  bad: "bg-bad",
  warn: "bg-warn",
  neutral: "bg-neutral",
  run: "bg-run",
  ie: "bg-ie",
};

function StatusBar({
  counts,
  total,
  max,
  codes,
}: {
  counts: { code: string; value: number }[];
  total: number;
  /** The busiest problem in the contest: bars are to scale, not each to itself. */
  max: number;
  codes: string[];
}) {
  if (total === 0) {
    return <div className="h-3 rounded-full bg-secondary" />;
  }
  return (
    <div
      className="flex h-3 gap-0.5 overflow-hidden rounded-full"
      style={{ width: `${max > 0 ? Math.max(2, (100 * total) / max) : 0}%` }}
    >
      {codes.map((code) => {
        const value = counts.find((entry) => entry.code === code)?.value ?? 0;
        if (value === 0) return null;
        return (
          <Tooltip key={code} content={`${code}: ${value} of ${total}`}>
            <span
              className={cn(
                "block h-full first:rounded-l-full last:rounded-r-full",
                TONE_FILL[verdictTone(code)],
              )}
              style={{ width: `${(100 * value) / total}%` }}
            />
          </Tooltip>
        );
      })}
    </div>
  );
}

/** Single-hue magnitude: one bar, the label beside it, the number in mono. */
function MagnitudeRow({
  label,
  value,
  max,
  suffix = "",
  hint,
}: {
  label: React.ReactNode;
  value: number;
  max: number;
  suffix?: string;
  hint?: string;
}) {
  const width = max > 0 ? Math.max(1.5, (100 * value) / max) : 0;
  return (
    <div className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_max-content] items-center gap-3">
      <span className="truncate text-sm text-subtle">{label}</span>
      <Tooltip content={hint ?? `${value}${suffix}`}>
        <span className="block h-2.5 rounded-full bg-secondary">
          <span className="block h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
        </span>
      </Tooltip>
      <span className="font-mono text-sm tabular-nums text-muted-foreground">
        {`${value.toFixed(suffix === "%" ? 1 : 0)}${suffix}`}
      </span>
    </div>
  );
}

export function StatsClient({
  contestKey,
  detail,
  stats,
  viewerUsername,
}: {
  contestKey: string;
  detail: ContestDetail;
  stats: ContestStats;
  viewerUsername: string | null;
}) {
  const live = useQuery(api.contests.stats, { key: contestKey });
  const data = live ?? stats;
  const contest = detail.contest;
  const joinKind = joinKindFor(detail);

  const codes = (data?.problemStatusCount ?? []).map((row) => row.code);
  const maxLanguageCount = Math.max(1, ...(data?.languageCount ?? []).map((row) => row.count));
  const maxProblemTotal = Math.max(1, ...(data?.problems ?? []).map((row) => row.total));

  return (
    <>
      <TitleRow
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {contest?.name ?? "Statistics"}
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
        active="stats"
        action={
          joinKind ? <JoinControl contestKey={contestKey} kind={joinKind} long size="default" /> : undefined
        }
      />

      {!data ? (
        <EmptyState
          icon={<PieChart aria-hidden />}
          title="Statistics are not out yet"
          description="Contest statistics are published when the contest ends."
        />
      ) : data.totalSubmissions === 0 ? (
        <EmptyState
          icon={<PieChart aria-hidden />}
          title="No submissions"
          description="Nobody submitted anything during this contest."
        />
      ) : (
        <div className="grid gap-6">
          <p className="text-base text-subtle">
            {data.totalSubmissions === 1
              ? "1 submission was made during this contest."
              : `${data.totalSubmissions} submissions were made during this contest.`}
          </p>

          <Panel title="Problem status distribution" bodyClassName="grid gap-3 p-4">
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {codes.map((code) => (
                <li key={code} className="flex items-center gap-1.5 text-sm text-subtle">
                  <span className={cn("size-2.5 rounded-full", TONE_FILL[verdictTone(code)])} aria-hidden />
                  <span className="font-mono text-xs uppercase">{code}</span>
                </li>
              ))}
            </ul>
            <div className="grid gap-2.5">
              {data.problems.map((problem, index) => (
                <div key={problem.code} className="grid gap-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm">
                      <span className="mr-2 font-mono font-medium text-muted-foreground">
                        {problem.label}
                      </span>
                      {problem.name}
                    </span>
                    <span className="font-mono text-sm tabular-nums text-muted-foreground">
                      {problem.total}
                    </span>
                  </div>
                  <StatusBar
                    codes={codes}
                    total={problem.total}
                    max={maxProblemTotal}
                    counts={data.problemStatusCount.map((row) => ({
                      code: row.code,
                      value: row.counts[index] ?? 0,
                    }))}
                  />
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Problem AC rate" bodyClassName="grid gap-2.5 p-4">
            {data.problems.map((problem) => (
              <MagnitudeRow
                key={problem.code}
                label={
                  <>
                    <span className="mr-2 font-mono font-medium text-muted-foreground">{problem.label}</span>
                    {problem.name}
                  </>
                }
                value={problem.acRate}
                max={100}
                suffix="%"
                hint={`${problem.name}: ${problem.acRate.toFixed(1)}% accepted of ${problem.total}`}
              />
            ))}
          </Panel>

          <div className="grid gap-6 min-[960px]:grid-cols-2">
            <Panel title="Submissions by language" bodyClassName="grid gap-2.5 p-4">
              {data.languageCount.length === 0 ? (
                <p className="text-sm text-muted-foreground">No submissions yet.</p>
              ) : (
                data.languageCount.map((row) => (
                  <MagnitudeRow
                    key={row.name}
                    label={row.name}
                    value={row.count}
                    max={maxLanguageCount}
                    hint={`${row.name}: ${row.count} of ${data.totalSubmissions}`}
                  />
                ))
              )}
            </Panel>

            <Panel title="Language AC rate" bodyClassName="grid gap-2.5 p-4">
              {data.languageAcRate.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing was accepted yet.</p>
              ) : (
                data.languageAcRate.map((row) => (
                  <MagnitudeRow
                    key={row.name}
                    label={row.name}
                    value={row.acRate}
                    max={100}
                    suffix="%"
                    hint={`${row.name}: ${row.acRate.toFixed(1)}% accepted`}
                  />
                ))
              )}
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}
