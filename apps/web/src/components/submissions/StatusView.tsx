"use client";

import { api } from "@convex/_generated/api";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  cn,
  MicroLabel,
  Panel,
  RatingName,
  Tooltip,
  VerdictPill,
  verdictTone,
} from "@moj/ui";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Check, ChevronRight, Clock, HardDrive, Server, X } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  absoluteTime,
  DASH,
  formatMemory,
  formatPoints,
  formatScore,
  formatTime,
  isGrading,
  verdictCode,
} from "@/lib/submissionFormat";
import type { StatusExtras } from "@/lib/submissionsData";
import { AnsiBlock } from "./AnsiBlock";
import styles from "./code.module.css";

type Detail = NonNullable<FunctionReturnType<typeof api.submissions.detail>>;

type TestCase = Detail["cases"][number];

/** `make_batch` (judge/views/submission.py:113): consecutive cases with the same
 *  batch number are one batch; a batch's points are the minimum its cases earned
 *  and its total the maximum they were worth. */
function groupCases(cases: TestCase[]): Array<{
  batch: number | null;
  cases: TestCase[];
  points: number;
  total: number;
}> {
  const groups: Array<{ batch: number | null; cases: TestCase[]; points: number; total: number }> = [];
  let buffer: TestCase[] = [];
  let last: number | null = null;

  const flush = () => {
    if (buffer.length === 0) return;
    groups.push({
      batch: last,
      cases: buffer,
      points: last ? Math.min(...buffer.map((row) => row.points)) : 0,
      total: last ? Math.max(...buffer.map((row) => row.total)) : 0,
    });
    buffer = [];
  };

  for (const testCase of cases) {
    const batch = testCase.batch ?? null;

    if (batch !== last && buffer.length > 0) flush();
    buffer.push(testCase);
    last = batch;
  }

  flush();

  return groups;
}

/** `get_statuses` + `combine_statuses`: one glyph per case, a batch collapsing to
 *  its first non-AC case, and a run of more than ten identical results combining. */
function statusStrip(
  groups: ReturnType<typeof groupCases>,
  graded: boolean,
): Array<{ key: string; status: string; combined: number }> {
  const flat: Array<{ key: string; status: string }> = [];

  for (const group of groups) {
    if (group.batch) {
      const worst = group.cases.find((row) => row.status !== "AC") ?? group.cases[0];

      if (worst) flat.push({ key: `b${group.batch}`, status: worst.status });
    } else {
      for (const row of group.cases) flat.push({ key: `c${row.case}`, status: row.status });
    }
  }

  if (!graded && flat.length > 0 && groups[groups.length - 1]?.batch) flat.pop();

  const out: Array<{ key: string; status: string; combined: number }> = [];
  let run: Array<{ key: string; status: string }> = [];

  const flush = () => {
    if (run.length === 0) return;
    const first = run[0];

    if (!first) return;

    if (run.length > 10) out.push({ key: first.key, status: first.status, combined: run.length });
    else for (const entry of run) out.push({ ...entry, combined: 1 });
    run = [];
  };

  for (const entry of flat) {
    if (run.length > 0 && run[0]?.status !== entry.status) flush();
    run.push(entry);
  }

  flush();

  return out;
}

const TONE_TEXT: Record<string, string> = {
  good: "text-good",
  bad: "text-bad",
  warn: "text-warn",
  neutral: "text-neutral",
  run: "text-run",
  ie: "text-ie",
};

/**
 * `submission/status.html` and `submission/status-testcases.html`, live by
 * subscription: the header, the progress indication while the judge is working,
 * the compile output, the per-case results grouped into batches, and the footing.
 */
export function StatusView({
  initial,
  extras,
  serverNow,
}: {
  initial: Detail;
  extras: StatusExtras;
  serverNow: number;
}) {
  const t = useTranslations("submissions.status");
  const live = useQuery(api.submissions.detail, { submissionId: String(extras.id) });
  const detail = live ?? initial;
  const row = detail.submission;
  const grading = isGrading(row.status);
  const code = verdictCode(row);
  const score = formatScore(row.casePoints, row.caseTotal);
  const groups = groupCases(detail.cases);
  const strip = statusStrip(groups, !grading);
  const maxExecutionTime = detail.cases.reduce((slowest, item) => Math.max(slowest, item.time), 0);

  return (
    <div className="grid gap-4">
      <Panel title={t("panelTitle", { id: extras.id })} bodyClassName="grid gap-3 p-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <VerdictPill verdict={code} judging={grading} label={grading ? row.status : undefined} size="lg" />
          <span className="font-mono text-h2 font-medium tabular-nums text-foreground">
            {grading || row.status === "IE" || row.status === "CE" || row.status === "AB" ? (
              <span className="text-muted-foreground">{DASH}</span>
            ) : (
              <>
                {score.earned}
                <span className="text-muted-foreground"> / {score.total}</span>
              </>
            )}
          </span>
          {row.masked ? (
            <Badge variant="run">{t("maskedBadge")}</Badge>
          ) : row.isPretested ? (
            <Badge variant="warn">{t("pretestsBadge")}</Badge>
          ) : null}
        </div>

        <dl className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <Meta label={t("metaProblem")} first>
            <Link href={`/problem/${extras.problem.code}`} className="text-link hover:text-link-hover">
              {extras.problem.name}
            </Link>
          </Meta>
          <Meta label={t("metaUser")}>
            <RatingName
              username={extras.user.username}
              rating={extras.user.rating}
              href={`/user/${extras.user.username}`}
              isAdmin={extras.user.displayRank === "admin"}
              className="text-sm"
            />
          </Meta>
          <Meta label={t("metaLanguage")}>
            <span className="font-mono">{extras.language?.name ?? DASH}</span>
          </Meta>
          <Meta label={t("metaSubmitted")}>
            <time dateTime={new Date(extras.date).toISOString()} className="font-mono tabular-nums">
              {absoluteTime(extras.date)}
            </time>
          </Meta>
          <Meta label={t("metaPoints")}>
            <span className="font-mono tabular-nums">
              {formatPoints(extras.contest ? extras.contest.points : row.points)}
              <span className="text-muted-foreground">
                {" / "}
                {formatPoints(extras.contest ? extras.contest.total : extras.problem.points)}
              </span>
            </span>
          </Meta>
          <Meta label={t("metaTime")} icon={<Clock aria-hidden className="size-3.5" />}>
            <span className="font-mono tabular-nums">
              {row.result === "TLE" ? DASH : formatTime(row.time, 3)}
            </span>
          </Meta>
          <Meta label={t("metaMemory")} icon={<HardDrive aria-hidden className="size-3.5" />}>
            <span className="font-mono tabular-nums">{formatMemory(row.memory)}</span>
          </Meta>
          {extras.judge ? (
            <Meta label={t("metaJudge")} icon={<Server aria-hidden className="size-3.5" />}>
              <span className="font-mono">{extras.judge}</span>
            </Meta>
          ) : null}
        </dl>

        {grading ? <Progress currentCase={row.currentTestcase} status={row.status} /> : null}
      </Panel>

      {!detail.canSeeDetail ? (
        <Alert variant="info">
          <AlertTitle>{t("privateTitle")}</AlertTitle>
          <AlertDescription>
            {extras.solveToView
              ? t("privateSolveFirst", { problem: extras.problem.name })
              : t("privateDescription")}
          </AlertDescription>
        </Alert>
      ) : row.status === "IE" ? (
        <Alert variant="danger">
          <AlertTitle>{t("internalErrorTitle")}</AlertTitle>
          <AlertDescription>{t("internalErrorDescription")}</AlertDescription>
        </Alert>
      ) : null}

      {detail.canSeeDetail && detail.error && row.status === "CE" ? (
        <Panel title={t("compileError")} bodyClassName="bg-warning-bg p-3 text-warning-ink">
          <AnsiBlock text={detail.error} />
        </Panel>
      ) : null}

      {detail.canSeeDetail && detail.error && row.status !== "CE" ? (
        <Panel
          title={row.status === "IE" ? t("errorInformation") : t("compileWarnings")}
          bodyClassName="bg-warning-bg p-3 text-warning-ink"
        >
          <AnsiBlock text={detail.error} />
        </Panel>
      ) : null}

      {detail.canSeeDetail && row.status !== "CE" && row.status !== "IE" ? (
        <>
          {strip.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2">
              <MicroLabel className="mr-1">
                {row.isPretested ? t("pretestResults") : t("executionResults")}
              </MicroLabel>
              {strip.map((entry) => (
                <span
                  key={entry.key}
                  className={cn(
                    "inline-flex items-center gap-0.5 font-mono text-xs tabular-nums",
                    TONE_TEXT[verdictTone(entry.status)] ?? "text-neutral",
                  )}
                  title={entry.status}
                >
                  {entry.status === "AC" ? (
                    <Check aria-hidden className="size-3.5" />
                  ) : entry.status === "SC" ? (
                    <span aria-hidden>–</span>
                  ) : (
                    <X aria-hidden className="size-3.5" />
                  )}
                  <span className="sr-only">{entry.status}</span>
                  {entry.combined > 1 ? <sup>×{entry.combined}</sup> : null}
                </span>
              ))}
              {grading ? (
                <span aria-hidden className="ml-1 size-2 animate-pulse-judging rounded-full bg-run" />
              ) : null}
            </div>
          ) : null}

          {groups.map((group, index) => (
            <CaseGroup
              key={group.batch ? `batch-${group.batch}` : `cases-${index}`}
              group={group}
              index={index}
              timeLimit={extras.timeLimit}
              outputPrefix={extras.outputPrefixOverride}
              isPretested={row.isPretested}
              currentCase={grading ? row.currentTestcase : 0}
            />
          ))}

          {!grading ? (
            <Panel title={t("resultTitle")} bodyClassName="grid gap-2 p-3 text-base">
              {row.result === "AB" ? (
                <p className="font-medium text-foreground">{t("aborted")}</p>
              ) : (
                <>
                  <Line label={t("resources")}>
                    <span className="font-mono tabular-nums">
                      {row.result === "TLE" ? DASH : formatTime(row.time, 3)}, {formatMemory(row.memory)}
                    </span>
                  </Line>
                  {row.result === "AC" ? (
                    <Line label={t("maxRuntime")}>
                      <span className="font-mono tabular-nums">
                        {formatTime(maxExecutionTime || extras.maxExecutionTime, 3)}
                      </span>
                    </Line>
                  ) : null}
                  <Line label={row.isPretested ? t("finalPretestScore") : t("finalScore")}>
                    <span className="font-mono tabular-nums">
                      {score.earned} / {score.total}
                      <span className="text-muted-foreground">
                        {" "}
                        {t("pointsOf", {
                          earned: formatPoints(extras.contest ? extras.contest.points : row.points),
                          total: formatPoints(extras.contest ? extras.contest.total : extras.problem.points),
                        })}
                      </span>
                    </span>
                  </Line>
                  {row.isPretested && row.result === "AC" ? (
                    <p className="text-sm italic text-muted-foreground">{t("pretestNote")}</p>
                  ) : null}
                </>
              )}
            </Panel>
          ) : null}
        </>
      ) : null}

      <p className="sr-only">{t("lastRead", { time: absoluteTime(serverNow) })}</p>
    </div>
  );
}

function Meta({
  label,
  icon,
  first = false,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  /** The first item has nothing to be separated from. */
  first?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {first ? null : (
        <span aria-hidden className="mr-0.5 text-border-strong">
          ·
        </span>
      )}
      {icon ? <span className="text-muted-foreground">{icon}</span> : null}
      <dt className="sr-only">{label}</dt>
      <dd className="text-subtle">{children}</dd>
    </span>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <p className="flex flex-wrap items-baseline gap-2">
      <span className="font-medium text-foreground">{label}:</span>
      <span className="text-subtle">{children}</span>
    </p>
  );
}

/**
 * A judge streams its cases as it runs them and never says how many there are,
 * so there is no honest denominator to fill a bar against: the bar pulses at
 * full width to say "working" rather than pretending to a percentage, and the
 * mono label carries the case the judge is on. A queued submission has no judge
 * yet, so it gets the words alone. Under reduced motion the pulse becomes a
 * static bar, because `--animate-pulse-judging` collapses to `none`.
 */
function Progress({ currentCase, status }: { currentCase: number; status: string }) {
  const t = useTranslations("submissions.status");
  const queued = status === "QU";

  return (
    <div className="flex items-center gap-3">
      {queued ? null : (
        <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-well">
          <div className="h-full w-full animate-pulse-judging rounded-full bg-royal" />
        </div>
      )}
      <span className="shrink-0 font-mono text-sm tabular-nums text-run">
        {queued ? t("queued") : currentCase > 0 ? t("judgingCase", { number: currentCase }) : t("processing")}
      </span>
    </div>
  );
}

function CaseGroup({
  group,
  index,
  timeLimit,
  outputPrefix,
  isPretested,
  currentCase,
}: {
  group: ReturnType<typeof groupCases>[number];
  index: number;
  timeLimit: number;
  outputPrefix: number | null;
  isPretested: boolean;
  currentCase: number;
}) {
  const t = useTranslations("submissions.cases");

  const rows = (
    <ul>
      {group.cases.map((testCase, position) => (
        <CaseRow
          key={testCase.case}
          testCase={testCase}
          label={
            group.batch
              ? t("caseLabel", { number: position + 1 })
              : isPretested
                ? t("pretestLabel", { number: testCase.case })
                : t("testCaseLabel", { number: testCase.case })
          }
          showPoints={!group.batch}
          timeLimit={timeLimit}
          outputPrefix={outputPrefix}
          isCurrent={currentCase === testCase.case}
        />
      ))}
    </ul>
  );

  if (!group.batch) {
    return (
      <Panel title={isPretested ? t("pretestsTitle") : t("testCasesTitle")} bodyClassName="p-0">
        {rows}
      </Panel>
    );
  }

  return (
    <Panel
      title={t("batchTitle", { number: group.batch })}
      action={
        <span className="font-mono text-xs tabular-nums text-titlebar-ink">
          {group.points} / {group.total}
        </span>
      }
      bodyClassName="p-0"
      data-batch={index}
    >
      {rows}
    </Panel>
  );
}

function CaseRow({
  testCase,
  label,
  showPoints,
  timeLimit,
  outputPrefix,
  isCurrent,
}: {
  testCase: TestCase;
  label: string;
  showPoints: boolean;
  timeLimit: number;
  outputPrefix: number | null;
  isCurrent: boolean;
}) {
  const t = useTranslations("submissions.cases");
  const [open, setOpen] = useState(false);

  const clipped =
    testCase.status !== "AC" && testCase.output.length > 0 && (outputPrefix === null || outputPrefix > 0);

  const expandable = clipped || testCase.extendedFeedback.length > 0;

  const output =
    outputPrefix === null ? testCase.output : testCase.output.slice(0, Math.max(0, outputPrefix));

  return (
    <li className="border-b border-border last:border-b-0">
      <div
        className={cn(
          "flex min-h-(--row-h-dense) flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1",
          isCurrent && "animate-pulse-judging",
        )}
      >
        {expandable ? (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((previous) => !previous)}
            className="inline-flex size-4 shrink-0 items-center justify-center rounded-xs text-muted-foreground hover:text-foreground"
            aria-label={open ? t("hideOutput", { label }) : t("showOutput", { label })}
          >
            <ChevronRight
              aria-hidden
              className={cn("size-3.5 transition-transform duration-(--dur)", open && "rotate-90")}
            />
          </button>
        ) : (
          <span aria-hidden className="size-4 shrink-0" />
        )}

        <span className="w-[9rem] shrink-0 font-mono text-sm tabular-nums text-subtle">{label}</span>

        <VerdictPill verdict={testCase.status} label={testCase.status === "SC" ? DASH : undefined} />

        <span className="w-20 shrink-0 text-right font-mono text-sm tabular-nums text-subtle">
          {testCase.status === "SC"
            ? DASH
            : testCase.status === "TLE"
              ? `> ${timeLimit > 0 ? formatTime(timeLimit, 3) : DASH}`
              : formatTime(testCase.time, 3)}
        </span>
        <span className="w-24 shrink-0 text-right font-mono text-sm tabular-nums text-muted-foreground">
          {testCase.status === "SC" ? DASH : formatMemory(testCase.memory)}
        </span>
        {showPoints ? (
          <span className="w-20 shrink-0 text-right font-mono text-sm tabular-nums text-muted-foreground">
            {testCase.points} / {testCase.total}
          </span>
        ) : null}

        {testCase.feedback ? (
          <Tooltip content={testCase.feedback}>
            <span className="min-w-0 flex-1 truncate text-sm text-subtle">{testCase.feedback}</span>
          </Tooltip>
        ) : (
          <span className="min-w-0 flex-1" />
        )}
      </div>

      {open ? (
        <div className="grid gap-3 border-t border-border px-3 py-3">
          {clipped ? (
            <div className="grid gap-1.5">
              <MicroLabel>{t("yourOutput")}</MicroLabel>
              <pre className={styles.output}>{output}</pre>
            </div>
          ) : null}
          {testCase.extendedFeedback ? (
            <div className="grid gap-1.5">
              <MicroLabel>{t("judgeFeedback")}</MicroLabel>
              <pre className={styles.output}>{testCase.extendedFeedback}</pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
