"use client";

import { api } from "@convex/_generated/api";
import {
  Badge,
  Button,
  cn,
  EmptyState,
  Pagination,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
} from "@moj/ui";
import { useQuery } from "convex/react";
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDashed,
  CircleSlash2,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { ContestLock } from "@/components/problems/ContestLock";
import { ActiveFilters, type FilterOptions, FilterPanel } from "@/components/problems/FilterPanel";
import { HotProblemsBox } from "@/components/problems/HotProblemsBox";
import { LocalTime } from "@/components/time/LocalTime";
import { type Catalog, type CatalogItem, type CatalogRow, viewCatalog } from "@/lib/problem-catalog";
import {
  activeFilterCount,
  EMPTY_QUERY,
  type ProblemQuery,
  type ProblemSort,
  parseProblemQuery,
  problemHref,
  problemQueryString,
  toggleSort,
} from "@/lib/problem-query";
import { formatPoints } from "@/lib/units";

type ListItem = CatalogItem;

const STATE_META = new Map([
  ["solved", { Icon: CheckCircle2, tone: "var(--state-solved)", label: "solved" }],
  ["partial", { Icon: CircleSlash2, tone: "var(--state-partial)", label: "partial" }],
  ["attempted", { Icon: CircleDashed, tone: "var(--state-attempted)", label: "attempted" }],
]);

function StateIcon({ state, code, username }: { state: string; code: string; username: string | null }) {
  const t = useTranslations("problems.list");
  const states = useTranslations("problems.state");
  const meta = STATE_META.get(state);

  if (!meta) return <span className="sr-only">{states("notAttempted")}</span>;
  const { Icon, tone } = meta;
  const label = states(meta.label);
  const glyph = <Icon size={14} aria-hidden style={{ color: tone }} />;

  return (
    <Tooltip content={label}>
      {username ? (
        <Link
          href={`/problem/${code}/submissions/${username}/`}
          className="relative z-1 inline-flex"
          aria-label={t("stateSubmissions", { state: label })}
        >
          {glyph}
        </Link>
      ) : (
        <span className="inline-flex" role="img" aria-label={label}>
          {glyph}
        </span>
      )}
    </Tooltip>
  );
}

/** DMOJ's sortable header: a button filling the cell, with the direction chevron
 *  after the label. Sort state lives in the URL query. */
function SortHead({
  label,
  sort,
  query,
  onApply,
  numeric,
  srLabel,
  className,
}: {
  label: React.ReactNode;
  sort: ProblemSort;
  query: ProblemQuery;
  onApply: (next: ProblemQuery) => void;
  numeric?: boolean;
  srLabel?: string;
  className?: string;
}) {
  const active = query.sort === sort;
  const Chevron = active && query.descending ? ChevronDown : ChevronUp;

  return (
    <TableHead numeric={numeric} className={cn("p-0", className)}>
      <button
        type="button"
        onClick={() => onApply(toggleSort(query, sort))}
        aria-label={srLabel}
        className={cn(
          "flex h-8 w-full items-center gap-1 px-3 text-inherit hover:text-titlebar-ink",
          numeric && "justify-end",
          active ? "text-titlebar-ink" : "text-titlebar-ink-2",
        )}
      >
        <span className="flex shrink-0 items-center [&_svg]:size-3.5">{label}</span>
        <Chevron size={12} aria-hidden className={active ? "text-titlebar-ink" : "text-titlebar-ink-2"} />
      </button>
    </TableHead>
  );
}

function EditorialCell({ item }: { item: ListItem }) {
  const t = useTranslations("problems.list");

  return item.hasPublicEditorial ? (
    <Tooltip content={t("editorialAvailable")}>
      <Link
        href={`/problem/${item.code}/editorial`}
        className="relative z-1 inline-flex"
        aria-label={t("editorialFor", { name: item.name })}
      >
        <BookOpen size={14} aria-hidden style={{ color: "var(--v-good)" }} />
      </Link>
    </Tooltip>
  ) : (
    <span role="img" aria-label={t("noEditorial")} className="inline-flex opacity-35">
      <BookOpen size={14} aria-hidden className="text-muted-foreground" />
    </span>
  );
}

function Row({ item, query, username }: { item: ListItem; query: ProblemQuery; username: string | null }) {
  return (
    <TableRow className="group">
      {username ? (
        <TableCell className="w-7 pr-0 text-center">
          <StateIcon state={item.state} code={item.code} username={username} />
        </TableCell>
      ) : null}
      <TableCell className="relative">
        {item.contestLabel ? (
          <span className="mr-1.5 font-mono text-sm font-medium text-muted-foreground">
            {item.contestLabel}.
          </span>
        ) : null}
        <Link
          href={`/problem/${item.code}`}
          className="font-medium text-foreground after:absolute after:inset-0 group-hover:text-link"
        >
          {item.name}
        </Link>
        <span className="ml-2 font-mono text-sm text-muted-foreground">{item.code}</span>
      </TableCell>
      <TableCell className="text-subtle">{item.group?.fullName ?? "—"}</TableCell>
      {query.showTypes ? (
        <TableCell className="text-subtle">
          {item.types.length > 0 ? (
            <span className="flex flex-wrap gap-1">
              {item.types.map((type) => (
                <Badge key={type.id} variant="neutral" rounding="square">
                  {type.fullName}
                </Badge>
              ))}
            </span>
          ) : (
            "—"
          )}
        </TableCell>
      ) : null}
      <TableCell numeric>
        {formatPoints(item.points)}
        {item.partial ? <span className="text-muted-foreground">p</span> : null}
      </TableCell>
      <TableCell numeric className="align-middle">
        <span className="inline-flex flex-col items-end gap-1">
          <span>{item.acRate.toFixed(1)}%</span>
          <span aria-hidden className="block h-[3px] w-10 rounded-full bg-well">
            <span
              className="block h-full rounded-full"
              style={{
                width: `${Math.min(100, Math.max(0, item.acRate))}%`,
                background: "var(--heat-2)",
              }}
            />
          </span>
        </span>
      </TableCell>
      <TableCell className="w-8 text-center">
        <EditorialCell item={item} />
      </TableCell>
      <TableCell numeric>
        <Link href={`/problem/${item.code}/rank/`} className="relative z-1 hover:text-link">
          {item.userCount.toLocaleString("en-AU")}
        </Link>
      </TableCell>
    </TableRow>
  );
}

/** Under 700px the list reflows into stacked rows rather than scrolling. */
function StackedRow({ item, username }: { item: ListItem; username: string | null }) {
  const t = useTranslations("problems.list");

  return (
    <li className="relative flex min-h-[44px] items-start gap-2 border-b border-border px-3 py-2.5 last:border-b-0">
      {username ? (
        <span className="mt-0.5 shrink-0">
          <StateIcon state={item.state} code={item.code} username={null} />
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <Link
          href={`/problem/${item.code}`}
          className="font-medium text-foreground after:absolute after:inset-0"
        >
          {item.contestLabel ? `${item.contestLabel}. ` : ""}
          {item.name}
        </Link>
        <p className="mt-1 font-mono text-sm tabular-nums text-muted-foreground">
          {formatPoints(item.points)}
          {item.partial ? "p" : ""}
          {" · "}
          {item.acRate.toFixed(1)}% · {t("users", { count: item.userCount })}
        </p>
      </div>
      {item.hasPublicEditorial ? (
        <BookOpen size={14} aria-label={t("editorialAvailable")} style={{ color: "var(--v-good)" }} />
      ) : null}
    </li>
  );
}

/** Waits a moment after the last change, so a search is not sent per keystroke. */
function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);

    return () => clearTimeout(timer);
  }, [value, ms]);

  return settled;
}

/** Ids the server answered for one key, held until the answer for the next key arrives. */
type IdAnswer = { key: string; ids: readonly string[] };

function useHeldIds(live: readonly string[] | undefined, key: string, seed: IdAnswer | null) {
  const [held, setHeld] = useState<IdAnswer | null>(seed);

  if (key && live !== undefined && (held?.key !== key || held.ids !== live)) setHeld({ key, ids: live });
  const ids = useMemo(() => (held ? new Set(held.ids) : null), [held]);

  return { ids, current: held?.key === key };
}

export type ProblemsSeeds = { searchIds: IdAnswer | null; solvedByIds: IdAnswer | null };

export function ProblemsView({
  initial,
  initialQuery,
  seeds,
  initialOptions,
  username,
  randomSeed,
}: {
  initial: Catalog;
  initialQuery: ProblemQuery;
  seeds: ProblemsSeeds;
  initialOptions: FilterOptions | null;
  username: string | null;
  randomSeed: number;
}) {
  const t = useTranslations("problems.list");
  const filters = useTranslations("problems.filters");

  // The query lives in the address so a filtered list is still a link, but the
  // list is filtered here: a change rewrites the address without navigating,
  // so nothing is fetched and the server renders nothing. Back and Forward
  // read the address again.
  const [query, setQuery] = useState(initialQuery);

  useEffect(() => {
    const restore = () => setQuery(parseProblemQuery(new URLSearchParams(window.location.search)));
    window.addEventListener("popstate", restore);

    return () => window.removeEventListener("popstate", restore);
  }, []);

  const apply = (next: ProblemQuery, { replace = false }: { replace?: boolean } = {}) => {
    setQuery(next);

    if (replace) window.history.replaceState(null, "", problemHref(next));
    else window.history.pushState(null, "", problemHref(next));
  };

  const goToPage = (page: number) => {
    apply({ ...query, page });
    window.scrollTo({ top: 0 });
  };

  // One subscription whatever the filters, so its arguments never change.
  const live = useQuery(api.problems.catalog, {});
  const [catalog, setCatalog] = useState(initial);

  // An answer replaces the list only when it was answered for the viewer the
  // page was rendered for. While the browser authenticates, or re-authenticates
  // when the session is refreshed on returning to the tab, answers come back
  // for nobody: without the viewer's solves, so drawing one dropped every
  // status filter and tick until the next answer put them back.
  if (live && live !== catalog && live.viewer === username) setCatalog(live);

  const searchKey = useSettled(query.fullText ? query.search.trim() : "", 250);
  const searchLive = useQuery(api.problems.searchIds, searchKey ? { search: searchKey } : "skip");
  const search = useHeldIds(searchLive, searchKey, seeds.searchIds);
  const solvedByKey = query.solvedBy.join("\n");

  const solvedByLive = useQuery(
    api.problems.solvedByIds,
    query.solvedBy.length > 0 ? { usernames: query.solvedBy } : "skip",
  );

  const solvedBy = useHeldIds(solvedByLive, solvedByKey, seeds.solvedByIds);

  // A statement match is added once the server has one for this very term; the
  // names and codes it would also have matched are already showing.
  const data = useMemo(
    () =>
      viewCatalog(catalog, query, {
        authenticated: username !== null,
        searchIds: search.current ? search.ids : null,
        solvedByIds: solvedBy.ids,
      }),
    [catalog, query, username, search, solvedBy.ids],
  );

  // A new "solved by" user is the one change the browser cannot answer alone;
  // the list it had stays up, dimmed, until the server's answer arrives.
  const waiting = query.solvedBy.length > 0 && !solvedBy.current;

  // `pages/problems:filterOptions` answers for the site; in contest mode the
  // list is the contest's own problems, so the panel offers what they carry.
  const options: FilterOptions = initialOptions ?? {
    types: dedupeTypes(catalog.rows),
    groups: dedupeGroups(catalog.rows),
    contests: [],
  };

  const columns = (username ? 1 : 0) + 5 + (query.showTypes ? 1 : 0);

  const lock = catalog.contestLock;

  const renderPanel = (bare: boolean) => (
    <FilterPanel
      bare={bare}
      query={query}
      options={options}
      onApply={apply}
      authenticated={username !== null}
      pointValues={data.pointValues}
      randomHref={`/problems/random/${problemQueryString({ ...query, page: 1 })}${
        problemQueryString({ ...query, page: 1 }) ? "&" : "?"
      }seed=${randomSeed}`}
    />
  );

  const panel = renderPanel(false);

  const pager =
    data.totalPages > 1 ? (
      <Pagination
        page={data.page}
        totalPages={data.totalPages}
        hrefFor={(page) => problemHref({ ...query, page })}
        onNavigate={goToPage}
        label={t("paginationLabel")}
      />
    ) : null;

  const body = (
    <>
      <ActiveFilters query={query} options={options} onApply={apply} />

      {data.items.length === 0 ? (
        <EmptyState
          icon={<Search size={20} />}
          title={t("emptyTitle")}
          description={activeFilterCount(query) > 0 ? t("emptyFiltered") : t("emptyUnpublished")}
          action={
            activeFilterCount(query) > 0 ? (
              <Button
                variant="secondary"
                onClick={() => apply({ ...EMPTY_QUERY, showTypes: query.showTypes })}
              >
                {filters("clear")}
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          <div className="max-md:hidden">
            <Table aria-label={t("title")} aria-busy={waiting || undefined}>
              <TableHeader>
                <TableRow>
                  {username ? (
                    <SortHead
                      label={<CheckCircle2 size={12} aria-hidden />}
                      srLabel={t("sortByStatus")}
                      sort="solved"
                      query={query}
                      onApply={apply}
                      className="w-7"
                    />
                  ) : null}
                  <SortHead label={t("columnProblem")} sort="name" query={query} onApply={apply} />
                  <SortHead label={t("columnCategory")} sort="group" query={query} onApply={apply} />
                  {query.showTypes ? (
                    <SortHead label={t("columnTypes")} sort="type" query={query} onApply={apply} />
                  ) : null}
                  <SortHead label={t("columnPoints")} sort="points" query={query} onApply={apply} numeric />
                  <SortHead label={t("columnAcRate")} sort="acRate" query={query} onApply={apply} numeric />
                  <SortHead
                    label={<BookOpen size={12} aria-hidden />}
                    srLabel={t("sortByEditorial")}
                    sort="editorial"
                    query={query}
                    onApply={apply}
                    className="w-8"
                  />
                  <SortHead label={t("columnUsers")} sort="userCount" query={query} onApply={apply} numeric />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.groups
                  ? data.groups.flatMap((group) => [
                      <TableRow key={`g-${group.contestKey}`} className="bg-secondary hover:bg-secondary">
                        <TableCell colSpan={columns} className="h-(--row-h-dense) py-0">
                          <span className="flex items-center justify-between gap-3">
                            <Link
                              href={`/contest/${group.contestKey}`}
                              className="font-sans text-xs font-semibold uppercase tracking-label text-subtle hover:text-link"
                            >
                              {group.contestName}
                            </Link>
                            <span className="font-mono text-sm tabular-nums text-muted-foreground">
                              <LocalTime value={group.startTime} format="date" />
                            </span>
                          </span>
                        </TableCell>
                      </TableRow>,
                      ...group.items.map((item) => (
                        <Row
                          key={`${group.contestKey}-${item.id}`}
                          item={item}
                          query={query}
                          username={username}
                        />
                      )),
                    ])
                  : null}
                {(data.groups ? data.ungrouped : data.items).map((item) => (
                  <Row key={item.id} item={item} query={query} username={username} />
                ))}
              </TableBody>
            </Table>
          </div>

          <ol className="overflow-hidden rounded-md border border-border bg-card md:hidden">
            {data.items.map((item) => (
              <StackedRow key={item.id} item={item} username={username} />
            ))}
          </ol>
        </>
      )}
    </>
  );

  return (
    <div id="content-body">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="font-mono text-sm tabular-nums text-muted-foreground">
          {t("count", { count: data.total })}
        </p>
        <div className="flex items-center gap-2">
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="secondary"
                icon={<SlidersHorizontal size={14} />}
                className="min-[900px]:hidden max-md:h-11"
              >
                {filters("open", { count: activeFilterCount(query) })}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto">
              <SheetHeader>
                <SheetTitle>{filters("title")}</SheetTitle>
              </SheetHeader>
              <div className="px-4 pb-6">{renderPanel(true)}</div>
            </SheetContent>
          </Sheet>
          {pager ? <div className="max-md:hidden">{pager}</div> : null}
        </div>
      </div>

      <div className="grid gap-6 min-[900px]:grid-cols-[1fr_17rem]">
        <div className="relative min-w-0">
          {/* The list is still sent — it is public either way — so this is a
              guard against wandering off mid-contest, not a secret. */}
          <div
            className={cn(
              lock && "pointer-events-none select-none blur-[5px]",
              waiting && "opacity-60 transition-opacity",
            )}
            aria-hidden={lock ? true : undefined}
            inert={lock ? true : undefined}
          >
            {body}
            {pager ? <div className="mt-4 flex justify-center">{pager}</div> : null}
          </div>
          {lock ? <ContestLock contestKey={lock.key} contestName={lock.name} /> : null}
        </div>
        <aside className="max-[899px]:hidden">
          <div className="sticky top-[70px] grid gap-4">
            {panel}
            <HotProblemsBox />
          </div>
        </aside>
      </div>
    </div>
  );
}

function dedupeTypes(items: readonly CatalogRow[]): FilterOptions["types"] {
  const seen = new Map<string, { name: string; fullName: string; count: number }>();

  for (const item of items) {
    for (const type of item.types) {
      const existing = seen.get(type.name);

      if (existing) existing.count += 1;
      else seen.set(type.name, { name: type.name, fullName: type.fullName, count: 1 });
    }
  }

  return [...seen.values()].sort((a, b) => a.fullName.localeCompare(b.fullName));
}

function dedupeGroups(items: readonly CatalogRow[]): FilterOptions["groups"] {
  const seen = new Map<string, { name: string; fullName: string; count: number }>();

  for (const item of items) {
    if (!item.group) continue;
    const existing = seen.get(item.group.name);

    if (existing) existing.count += 1;
    else seen.set(item.group.name, { name: item.group.name, fullName: item.group.fullName, count: 1 });
  }

  return [...seen.values()].sort((a, b) => a.fullName.localeCompare(b.fullName));
}
