"use client";

import { api } from "@convex/_generated/api";
import type { ContestDetail, ContestProblemEntry } from "@convex/contests";
import {
  Badge,
  Button,
  ContentDescription,
  cn,
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
import { BookOpen, CircleHelp, Clock, FileArchive, FileDown, Send } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { JoinControl } from "@/components/contests/JoinControls";
import { ContestChips, OPEN_ENDED, ProblemStateIcon, useHumanDuration } from "@/components/contests/pieces";
import { QuickSubmit } from "@/components/problems/QuickSubmit";
import { useSkin } from "@/components/shell/SkinProvider";
import { COUNTDOWN_HORIZON, formatDuration, useCountdown } from "@/lib/countdown";
import { formatDateTime, formatPoints } from "@/lib/format";
import { Clarifications } from "./Clarifications";
import { ProblemsNotReleased } from "./ProblemsNotReleased";
import { contestTabs, joinKindFor } from "./tabs";

const DASH = "—";

/** DMOJ's `#banner`: one sentence saying where the viewer stands in the clock. */
function Banner({ detail }: { detail: ContestDetail }) {
  const t = useTranslations("contests.detail");
  const windowCopy = useTranslations("contests.duration");
  const humanDuration = useHumanDuration();
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

  if (spectating) sentence = clock ? t("spectatingEndsIn", { time: clock }) : t("spectating");
  else if (virtual) sentence = clock ? t("virtualRemaining", { time: clock }) : t("virtual");
  else if (!detail.timing.started) sentence = clock ? t("startingIn", { time: clock }) : t("notStarted");
  else if (detail.timing.ended) sentence = t("over");
  else if (live?.ended) sentence = clock ? t("timeUpEndsIn", { time: clock }) : t("timeUp");
  else if (live) sentence = clock ? t("remaining", { time: clock }) : t("participating");
  else sentence = clock ? t("endsIn", { time: clock }) : t("running");

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
            ? windowCopy("windowBetween", {
                duration: humanDuration(contest.timeLimit * 1000),
                start: formatDateTime(contest.startTime),
                end: formatDateTime(contest.endTime),
              })
            : contest.endTime - contest.startTime > OPEN_ENDED
              ? windowCopy("openEndedStarting", { start: formatDateTime(contest.startTime) })
              : windowCopy("lengthStarting", {
                  duration: humanDuration(contest.endTime - contest.startTime),
                  start: formatDateTime(contest.startTime),
                })}
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
  canSubmit,
  defaultLanguageKey,
  ended,
  precision,
}: {
  problem: ContestProblemEntry;
  contestKey: string;
  showEditorials: boolean;
  showState: boolean;
  canSubmit: boolean;
  defaultLanguageKey: string | null;
  ended: boolean;
  precision: number;
}) {
  const t = useTranslations("contests.detail");
  const states = useTranslations("contests.problemState");
  const columns = useTranslations("contests.columns");

  /**
   * DOMjudge has no page for a problem: the statement is a PDF you download and
   * the name in the list is text. Wearing its skin, so is this one — the row's
   * way in is the Statement button beside it.
   */
  const skin = useSkin();
  const openable = problem.isAccessible && skin !== "domjudge";

  const solvedNote =
    problem.state === "solved"
      ? ended && problem.solvedSinceContest
        ? t("solvedSince")
        : problem.solvedDuringContest
          ? t("solvedDuring")
          : states("solved")
      : problem.state === "partial"
        ? states("partial")
        : problem.state === "attempted"
          ? states("attempted")
          : states("untouched");

  return (
    // The two-line row height the submission list uses: a row carrying a letter,
    // a name, a code and three buttons has no business being 34px tall.
    <TableRow className="group [&>td]:h-(--row-h-2)">
      {showState ? (
        <TableCell className="relative w-7 pr-0">
          <ProblemStateIcon state={problem.state} title={solvedNote} />
        </TableCell>
      ) : null}
      <TableCell className="relative">
        <span className="flex min-w-0 items-center gap-2.5">
          {/* The letter as the chip the contest bar wears, so the same problem
              is picked out the same way in both places. */}
          <span className="flex size-6 shrink-0 items-center justify-center rounded-xs border border-border bg-secondary font-mono text-sm font-medium text-muted-foreground">
            {problem.label}
          </span>
          <span className="grid min-w-0 gap-0.5">
            <span className="flex flex-wrap items-center gap-x-2">
              {openable ? (
                <Link
                  href={`/problem/${problem.code}/`}
                  className="font-medium text-foreground before:absolute before:inset-0 hover:text-link"
                >
                  {problem.name}
                </Link>
              ) : (
                <span className="font-medium text-foreground">{problem.name}</span>
              )}
              {problem.isPretested ? (
                <Badge variant="neutral" rounding="square" mono>
                  {t("pretested")}
                </Badge>
              ) : null}
            </span>
            {/* Under the name rather than beside it: the code is what you type
                into a search box, not part of the title. */}
            <span className="font-mono text-sm leading-none text-muted-foreground">{problem.code}</span>
          </span>
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
            <Tooltip
              content={t("scoreDuringContest", {
                points: formatPoints(problem.contestBestScore, precision),
              })}
            >
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
        <TableCell className="relative z-1 w-20">
          {problem.isAccessible && problem.hasPublicEditorial ? (
            <Tooltip content={columns("editorial")}>
              <Link href={`/problem/${problem.code}/editorial/`} className="text-good">
                <BookOpen size={14} aria-hidden />
                <span className="sr-only">{columns("editorial")}</span>
              </Link>
            </Tooltip>
          ) : (
            <BookOpen size={14} className="text-muted-foreground opacity-35" aria-hidden />
          )}
        </TableCell>
      ) : null}
      {/* Above the row's own link, like the other cells that carry one of their
          own — otherwise the overlay swallows the buttons. */}
      <TableCell className="relative z-1 w-px">
        <span className="flex items-center justify-end gap-1.5 whitespace-nowrap">
          {problem.isAccessible ? (
            <Tooltip content={t("statementHint")}>
              <Button asChild variant="ghost" size="sm" icon={<FileDown size={14} />}>
                <a href={`/problem/${problem.code}/pdf`} download={`${problem.code}.pdf`}>
                  {t("statement")}
                </a>
              </Button>
            </Tooltip>
          ) : null}
          {problem.isAccessible && problem.hasSamples ? (
            <Tooltip content={t("samplesHint")}>
              <Button asChild variant="ghost" size="sm" icon={<FileArchive size={14} />}>
                <a href={`/problem/${problem.code}/samples`} download={`${problem.code}-samples.zip`}>
                  {t("samples")}
                </a>
              </Button>
            </Tooltip>
          ) : null}
          {problem.isAccessible && canSubmit ? (
            <QuickSubmit
              problemCode={problem.code}
              problemName={problem.name}
              defaultLanguageKey={defaultLanguageKey}
              submissionsLeft={problem.submissionsLeft}
            >
              <Button variant="secondary" size="sm" icon={<Send size={14} />}>
                {t("submit")}
              </Button>
            </QuickSubmit>
          ) : null}
        </span>
      </TableCell>
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

function UserList({
  users,
}: {
  users: { _id: string; username: string; displayName: string; rating: number | null; displayRank: string }[];
}) {
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

/** DMOJ's scoreboard-visibility codes, as the sentence each one reads as. */
const SCOREBOARD_KEYS = new Map([
  ["V", "scoreboardVisible"],
  ["C", "scoreboardAfterWindow"],
  ["P", "scoreboardHidden"],
  ["H", "scoreboardAlwaysHidden"],
]);

function Sidebar({ detail }: { detail: ContestDetail }) {
  const t = useTranslations("contests.detail");
  const duration = useTranslations("contests.duration");
  const scoring = useTranslations("contests.scoring");
  const humanDuration = useHumanDuration();
  const contest = detail.contest;

  if (!contest) return null;

  // The bounds go in as text: they are ratings, not quantities, and a
  // thousands separator in "rated between 1,200 and 1,800" reads as a mistake.
  const ratingLine = !contest.isRated
    ? t("notRated")
    : contest.ratingFloor !== null && contest.ratingCeiling !== null
      ? t("ratedBetween", { floor: String(contest.ratingFloor), ceiling: String(contest.ratingCeiling) })
      : contest.ratingFloor !== null
        ? t("ratedAtLeast", { floor: String(contest.ratingFloor) })
        : contest.ratingCeiling !== null
          ? t("ratedAtMost", { ceiling: String(contest.ratingCeiling) })
          : t("isRated");

  return (
    <>
      <Panel title={t("panelContest")} bodyClassName="p-0">
        <InfoRow label={t("starts")}>
          <span className="font-mono text-sm tabular-nums">{formatDateTime(contest.startTime)}</span>
        </InfoRow>
        <InfoRow label={t("ends")}>
          <span className="font-mono text-sm tabular-nums">
            {contest.endTime - contest.startTime > OPEN_ENDED ? DASH : formatDateTime(contest.endTime)}
          </span>
        </InfoRow>
        <InfoRow label={contest.timeLimit ? t("window") : t("duration")}>
          <span className="font-mono text-sm tabular-nums">
            {contest.timeLimit
              ? humanDuration(contest.timeLimit * 1000)
              : contest.endTime - contest.startTime > OPEN_ENDED
                ? duration("openEnded")
                : humanDuration(contest.endTime - contest.startTime)}
          </span>
        </InfoRow>
        <InfoRow label={t("format")}>
          <span>{detail.format.displayName}</span>
        </InfoRow>
        <InfoRow label={t("rated")}>{ratingLine}</InfoRow>
        <InfoRow label={t("scoreboard")}>
          {t(SCOREBOARD_KEYS.get(contest.scoreboardVisibility) ?? "scoreboardVisible")}
        </InfoRow>
        {contest.freezeMinutes > 0 ? (
          <InfoRow label={t("freeze")}>
            <span className="font-mono text-sm tabular-nums">
              {t("freezeBeforeEnd", { count: contest.freezeMinutes })}
            </span>
          </InfoRow>
        ) : null}
        <InfoRow label={t("users")}>
          <Link href={`/contest/${contest.key}/ranking/`} className="font-mono text-sm tabular-nums">
            {contest.userCount}
          </Link>
        </InfoRow>
        {detail.viewer.requiresAccessCode ? (
          <InfoRow label={t("access")}>{t("accessCodeRequired")}</InfoRow>
        ) : null}
      </Panel>

      {detail.format.shortFormDisplay.length > 0 ? (
        <Panel title={t("panelScoring")} bodyClassName="p-3">
          <ul className="grid gap-2 text-sm text-subtle">
            {detail.format.shortFormDisplay.map((line) => (
              <li key={line.key}>{emphasise(scoring(line.key, line.values))}</li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {contest.authors.length > 0 ||
      contest.testers.length > 0 ||
      contest.curators.length > 0 ||
      contest.spectators.length > 0 ? (
        <Panel title={t("panelPeople")} bodyClassName="p-0">
          {contest.authors.length > 0 ? (
            <InfoRow label={t("authors", { count: contest.authors.length })}>
              <UserList users={contest.authors} />
            </InfoRow>
          ) : null}
          {contest.curators.length > 0 ? (
            <InfoRow label={t("curators", { count: contest.curators.length })}>
              <UserList users={contest.curators} />
            </InfoRow>
          ) : null}
          {contest.testers.length > 0 ? (
            <InfoRow label={t("testers", { count: contest.testers.length })}>
              <UserList users={contest.testers} />
            </InfoRow>
          ) : null}
          {contest.spectators.length > 0 ? (
            <InfoRow label={t("spectators", { count: contest.spectators.length })}>
              <UserList users={contest.spectators} />
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
  defaultLanguageKey,
}: {
  contestKey: string;
  initial: ContestDetail;
  descriptionHtml: string;
  /** The submit dialog opens on the member's own language, as the page does. */
  defaultLanguageKey: string | null;
}) {
  const t = useTranslations("contests.detail");
  const columns = useTranslations("contests.columns");
  const tabLabels = useTranslations("contests.tabs");
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
        tabs={contestTabs(detail, contestKey, tabLabels)}
        active="detail"
        action={
          joinKind ? (
            <JoinControl
              contestKey={contestKey}
              kind={joinKind}
              long
              size="default"
              banned={detail.viewer.isBanned}
            />
          ) : undefined
        }
      />

      <Banner detail={detail} />

      <TwoColumn side={<Sidebar detail={detail} />}>
        {!showProblems ? (
          <ProblemsNotReleased />
        ) : (
          <section className="grid gap-2">
            <h2 className="flex items-center gap-2 font-display text-h2 font-semibold">
              <CircleHelp size={18} className="text-muted-foreground" aria-hidden />
              {t("problems")}
            </h2>
            <Table>
              <TableHeader>
                <TableRow>
                  {showState ? <TableHead className="w-7" /> : null}
                  <TableHead className="w-full">{columns("problem")}</TableHead>
                  <TableHead numeric>{columns("points")}</TableHead>
                  {showState ? <TableHead numeric>{columns("yourScore")}</TableHead> : null}
                  <TableHead numeric>{columns("acRate")}</TableHead>
                  <TableHead numeric>{columns("users")}</TableHead>
                  {detail.metadata.hasPublicEditorials ? (
                    <TableHead className="w-20">{columns("editorial")}</TableHead>
                  ) : null}
                  <TableHead numeric className="w-px">
                    {columns("actions")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.problems.length === 0 ? (
                  <EmptyRow colSpan={8}>{t("noProblems")}</EmptyRow>
                ) : (
                  detail.problems.map((problem) => (
                    <ProblemRow
                      key={problem.contestProblemId}
                      problem={problem}
                      contestKey={contestKey}
                      showEditorials={detail.metadata.hasPublicEditorials}
                      showState={showState}
                      canSubmit={detail.viewer.isAuthenticated}
                      defaultLanguageKey={defaultLanguageKey}
                      ended={detail.timing.ended}
                      precision={precision}
                    />
                  ))
                )}
              </TableBody>
            </Table>
            {detail.timing.ended &&
            showState &&
            detail.problems.some((problem) => problem.state !== "untouched") ? (
              <p className="text-sm text-muted-foreground">{t("tickNote")}</p>
            ) : null}
          </section>
        )}

        {/* Under the problems now: a long description used to bury them. */}
        <ContentDescription html={descriptionHtml} className="mt-8" />

        {contest.useClarifications ? (
          <Clarifications
            contestKey={contestKey}
            canPost={detail.viewer.canEdit}
            problems={detail.problems}
          />
        ) : null}
      </TwoColumn>
    </>
  );
}

/** `get_short_form_display` marks the part that matters — the penalty, the
 *  number of problems that count — in bold. The strings come out of `@moj/core`,
 *  which is pure and has no markup, so the emphasis arrives as `**...**` and is
 *  turned into a `strong` here rather than shown as asterisks. */
function emphasise(line: string): React.ReactNode {
  const parts = line.split("**");

  if (parts.length < 3) return line;

  return parts.map((part, index) =>
    index % 2 === 1 ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: the split is positional
      <strong key={index} className="font-medium text-foreground">
        {part}
      </strong>
    ) : (
      part
    ),
  );
}
