"use client";

import { api } from "@convex/_generated/api";
import type { ActiveParticipation, ContestListPayload, ContestListRow } from "@convex/contests";
import {
  Button,
  cn,
  EmptyState,
  InputGroup,
  InputGroupInput,
  MicroLabel,
  Pagination,
  Select,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
} from "@moj/ui";
import { useQuery } from "convex/react";
import { CalendarClock, ChevronDown, ChevronUp, Search, Trophy } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { JoinControl } from "@/components/contests/JoinControls";
import { ContestChips, ContestWindow, UserCount } from "@/components/contests/pieces";
import { COUNTDOWN_HORIZON, formatDuration, useCountdown } from "@/lib/countdown";
import { ContestProgress } from "./ContestProgress";
import { type ContestListArgs, PAST_PER_PAGE } from "./shared";

/** Radix has no empty option value, so "every tag" needs a name of its own. */
const ALL_TAGS = "__all__";

const SKELETON_ROWS = ["a", "b", "c", "d", "e", "f"];

/** A live countdown that reads as a sentence, as DMOJ's `as_countdown` does.
 *  The sentence is one message rather than a label beside a clock, because the
 *  clock does not sit at the end of it in every language. */
function Countdown({ sentence, endsAt }: { sentence: string; endsAt: number }) {
  const t = useTranslations("contests.list");
  const remaining = useCountdown(endsAt);

  if (remaining === null || remaining > COUNTDOWN_HORIZON) return null;
  const urgent = remaining < 300_000;

  return (
    <span
      className={cn(
        "font-mono text-sm font-medium tabular-nums",
        urgent ? "text-bad" : "text-muted-foreground",
      )}
    >
      {t(sentence, { time: formatDuration(remaining) })}
    </span>
  );
}

function ContestName({ contest }: { contest: ContestListRow }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <Link
        href={`/contest/${contest.key}/`}
        className="font-medium text-foreground before:absolute before:inset-0 hover:text-link"
      >
        {contest.name}
      </Link>
      <ContestChips
        isVisible={contest.isVisible}
        isPrivate={contest.isPrivate}
        isOrganizationPrivate={contest.isOrganizationPrivate}
        isRated={contest.isRated}
        organizations={contest.organizations}
        tags={contest.tags}
      />
    </span>
  );
}

function ContestBlock({ contest, when }: { contest: ContestListRow; when?: React.ReactNode }) {
  return (
    <TableCell className="relative py-2 align-top">
      <div className="grid gap-1">
        <ContestName contest={contest} />
        {when}
        <ContestWindow
          startTime={contest.startTime}
          endTime={contest.endTime}
          timeLimit={contest.timeLimit}
        />
        {contest.progress ? <ContestProgress progress={contest.progress} /> : null}
      </div>
    </TableCell>
  );
}

function ListTable({
  caption,
  rows,
  renderWhen,
  action,
  inContest,
}: {
  caption: string;
  rows: ContestListRow[];
  renderWhen?: (contest: ContestListRow) => React.ReactNode;
  action?: (contest: ContestListRow) => React.ReactNode;
  inContest: boolean;
}) {
  const columns = useTranslations("contests.columns");

  return (
    <section className="grid gap-2">
      <h2 className="font-display text-h2 font-semibold">{caption}</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-full">{columns("contest")}</TableHead>
            <TableHead numeric>{columns("users")}</TableHead>
            {action && !inContest ? <TableHead className="w-[1%]" /> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((contest) => (
            <TableRow key={contest._id} className="group">
              <ContestBlock contest={contest} when={renderWhen?.(contest)} />
              <TableCell numeric className="align-middle">
                <UserCount count={contest.userCount} href={`/contest/${contest.key}/ranking/`} />
              </TableCell>
              {action && !inContest ? (
                <TableCell className="relative z-1 align-middle">{action(contest)}</TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

function ActiveRow({ participation }: { participation: ActiveParticipation }) {
  const contest = participation.contest;

  return (
    <TableRow className="group">
      <ContestBlock
        contest={contest}
        when={
          <Countdown sentence={contest.timeLimit ? "windowEndsIn" : "endsIn"} endsAt={participation.endsAt} />
        }
      />
      <TableCell numeric className="align-middle">
        <UserCount count={contest.userCount} href={`/contest/${contest.key}/ranking/`} />
      </TableCell>
      <TableCell className="relative z-1 align-middle">
        <JoinControl contestKey={contest.key} kind="leave" full size="default" />
      </TableCell>
    </TableRow>
  );
}

function ListSkeleton() {
  return (
    <div className="grid gap-2">
      <Skeleton className="h-5 w-40" />
      <div className="overflow-hidden rounded-md border border-border bg-card">
        {SKELETON_ROWS.map((row) => (
          <div key={row} className="flex items-center gap-4 border-b border-border px-3 py-3 last:border-b-0">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="ml-auto h-4 w-10" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ContestListClient({
  args,
  initial,
  page,
  search,
  tagName,
  sort,
  descending,
  inContest,
}: {
  args: ContestListArgs;
  initial: ContestListPayload | null;
  page: number;
  search: string;
  tagName: string;
  sort: string;
  descending: boolean;
  inContest: boolean;
}) {
  const t = useTranslations("contests.list");
  const columns = useTranslations("contests.columns");
  const router = useRouter();
  const searchParams = useSearchParams();
  const live = useQuery(api.contests.list, args);
  const data = live ?? initial;
  const [draft, setDraft] = useState(search);

  useEffect(() => {
    setDraft(search);
  }, [search]);

  const hrefWith = (changes: Record<string, string | null>): string => {
    const next = new URLSearchParams(searchParams?.toString() ?? "");

    for (const [name, value] of Object.entries(changes)) {
      if (value === null || value === "") next.delete(name);
      else next.set(name, value);
    }

    const query = next.toString();

    return query ? `/contests/?${query}` : "/contests/";
  };

  if (!data) return <ListSkeleton />;

  const totalPages = Math.max(1, Math.ceil(data.totalPast / PAST_PER_PAGE));

  const tagOptions = [
    { value: ALL_TAGS, label: t("allTags") },
    ...[
      ...new Map(
        [...data.current, ...data.future, ...data.past.page]
          .flatMap((contest) => contest.tags)
          .map((tag) => [tag.name, tag] as const),
      ).values(),
    ].map((tag) => ({ value: tag.name, label: tag.name })),
  ];

  const sortLink = (column: "name" | "userCount" | "startTime", label: string) => {
    const isActive = sort === column;
    const nextOrder = isActive && !descending ? "desc" : "asc";

    return (
      <Link
        href={hrefWith({ sort: column, order: nextOrder, page: null })}
        className={cn(
          "inline-flex items-center gap-1 text-titlebar-ink",
          isActive ? "font-semibold" : "text-titlebar-ink-2 hover:text-titlebar-ink",
        )}
      >
        {label}
        {isActive ? (
          descending ? (
            <ChevronDown size={12} className="text-canary" aria-hidden />
          ) : (
            <ChevronUp size={12} className="text-canary" aria-hidden />
          )
        ) : (
          <ChevronDown size={12} className="opacity-50" aria-hidden />
        )}
      </Link>
    );
  };

  return (
    <div className="grid min-w-0 gap-8">
      {data.activeParticipations.length > 0 ? (
        <section className="grid gap-2">
          <h2 className="font-display text-h2 font-semibold">{t("active")}</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-full">{columns("contest")}</TableHead>
                <TableHead numeric>{columns("users")}</TableHead>
                <TableHead className="w-[1%]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.activeParticipations.map((participation) => (
                <ActiveRow key={participation.participationId} participation={participation} />
              ))}
            </TableBody>
          </Table>
        </section>
      ) : null}

      {data.current.length > 0 ? (
        <ListTable
          caption={t("ongoing")}
          rows={data.current}
          inContest={inContest}
          renderWhen={(contest) => <Countdown sentence="endsIn" endsAt={contest.endTime} />}
          action={(contest) => (
            <JoinControl
              contestKey={contest.key}
              // The list cannot tell join from spectate without the contest page's
              // rules; DMOJ makes that call on the contest page, so a row offers
              // Join and the mutation says no if the viewer may not.
              kind={data.finishedKeys.includes(contest.key) ? "spectate" : "join"}
              full
              size="default"
            />
          )}
        />
      ) : null}

      <section className="grid gap-2">
        <h2 className="font-display text-h2 font-semibold">{t("upcoming")}</h2>
        {data.future.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{columns("contest")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.future.map((contest) => (
                <TableRow key={contest._id} className="group">
                  <ContestBlock
                    contest={contest}
                    when={<Countdown sentence="startingIn" endsAt={contest.startTime} />}
                  />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState
            icon={<CalendarClock aria-hidden />}
            title={t("nothingScheduledTitle")}
            description={t("nothingScheduledBody")}
            action={
              <Button asChild variant="secondary" size="sm">
                <a href="#past-contests">{t("past")}</a>
              </Button>
            }
          />
        )}
      </section>

      <section id="past-contests" className="grid gap-3 scroll-mt-24">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-display text-h2 font-semibold">{t("past")}</h2>
          <div className="flex flex-wrap items-end gap-3">
            {tagOptions.length > 1 ? (
              <div className="grid gap-1">
                <MicroLabel>{t("tag")}</MicroLabel>
                <Select
                  ariaLabel={t("filterByTag")}
                  options={tagOptions}
                  value={tagName || ALL_TAGS}
                  size="sm"
                  onValueChange={(value) =>
                    router.push(hrefWith({ tag: value === ALL_TAGS ? null : value, page: null }))
                  }
                />
              </div>
            ) : null}
            <form
              className="grid gap-1"
              onSubmit={(event) => {
                event.preventDefault();
                router.push(hrefWith({ search: draft || null, page: null }));
              }}
            >
              <MicroLabel>{t("search")}</MicroLabel>
              <InputGroup className="h-(--control-h-sm) w-[220px]" leading={<Search size={14} aria-hidden />}>
                <InputGroupInput
                  id="contest-search"
                  name="search"
                  type="search"
                  value={draft}
                  placeholder={t("searchPlaceholder")}
                  onChange={(event) => setDraft(event.target.value)}
                  className="text-[16px] md:text-base"
                />
              </InputGroup>
            </form>
          </div>
        </div>

        {data.past.page.length > 0 ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-full">{sortLink("name", columns("contest"))}</TableHead>
                  <TableHead numeric>{sortLink("userCount", columns("users"))}</TableHead>
                  {!inContest ? <TableHead className="w-[1%]" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.past.page.map((contest) => (
                  <TableRow key={contest._id} className="group">
                    <ContestBlock contest={contest} />
                    <TableCell numeric className="align-middle">
                      <UserCount count={contest.userCount} href={`/contest/${contest.key}/ranking/`} />
                    </TableCell>
                    {!inContest ? (
                      <TableCell className="relative z-1 align-middle">
                        <Tooltip content={t("virtualHint")}>
                          <span className="inline-block">
                            <JoinControl contestKey={contest.key} kind="virtual" full size="default" />
                          </span>
                        </Tooltip>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination
              page={page}
              totalPages={totalPages}
              hrefFor={(next) => hrefWith({ page: next === 1 ? null : String(next) })}
            />
          </>
        ) : (
          <EmptyState
            icon={<Trophy aria-hidden />}
            title={search ? t("noMatchesTitle") : t("noPastTitle")}
            description={search ? t("noMatchesBody", { search }) : t("noPastBody")}
            action={
              search ? (
                <Button asChild variant="secondary" size="sm">
                  <Link href={hrefWith({ search: null, page: null })}>{t("clearSearch")}</Link>
                </Button>
              ) : undefined
            }
          />
        )}
      </section>
    </div>
  );
}
