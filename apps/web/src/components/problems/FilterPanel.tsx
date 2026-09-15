"use client";

import {
  Badge,
  Button,
  Checkbox,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  cn,
  Input,
  InputGroup,
  InputGroupInput,
  Kbd,
  MultiSelect,
  Panel,
  RadioGroup,
  Select,
  Slider,
  Switch,
} from "@moj/ui";
import { ChevronRight, RotateCcw, Search, Shuffle, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";
import {
  activeFilterCount,
  EMPTY_QUERY,
  type ProblemQuery,
  type ProblemSort,
  problemQueryString,
} from "@/lib/problem-query";

export type FilterOptions = {
  types: { name: string; fullName: string; count: number }[];
  groups: { name: string; fullName: string; count: number }[];
  contests: { key: string; name: string; startTime: number; problemCount: number }[];
};

/** A value that came in from the URL must stay selectable even when the option
 *  list has not loaded it — otherwise the control renders blank. */
function withCurrent(
  options: { value: string; label: string }[],
  ...values: string[]
): { value: string; label: string }[] {
  const known = new Set(options.map((option) => option.value));

  const extra = values
    .filter((value) => value && !known.has(value))
    .map((value) => ({ value, label: value }));

  return [...options, ...extra];
}

/** A group of the panel: a hairline, a micro-label header carrying its active
 *  count, and a body that animates open. No nested boxes (DESIGN 17.1). */
function Group({
  label,
  count,
  defaultOpen = true,
  children,
}: {
  label: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-t border-border">
      <CollapsibleTrigger className="flex w-full items-center gap-2 py-2 text-left">
        <ChevronRight
          size={12}
          aria-hidden
          className={cn("shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
        />
        <span className="flex-1 font-sans text-xs font-semibold uppercase tracking-label text-subtle">
          {label}
        </span>
        {count ? (
          <Badge variant="accent" mono>
            {count}
          </Badge>
        ) : null}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="grid gap-2 pb-3">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** A 26px option row: label left, facet count right in mono. */
function OptionRow({
  checked,
  onChange,
  label,
  count,
  id,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  count?: number;
  id: string;
}) {
  return (
    <div className="flex min-h-[26px] items-center gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={onChange} label={label} labelClassName="flex-1" />
      {count === undefined ? null : (
        <span className="shrink-0 font-mono text-sm tabular-nums text-muted-foreground">{count}</span>
      )}
    </div>
  );
}

export function FilterPanel({
  query,
  options,
  onApply,
  authenticated,
  pointValues,
  randomHref,
  busy,
  bare = false,
}: {
  query: ProblemQuery;
  options: FilterOptions;
  onApply: (next: ProblemQuery) => void;
  authenticated: boolean;
  pointValues: { min: number; max: number };
  randomHref: string;
  busy?: boolean;
  /** Inside the mobile sheet the sheet's own header is the title, so the panel
   *  drops its titlebar rather than repeating the word. */
  bare?: boolean;
}) {
  const t = useTranslations("problems.filters");
  const ids = useId();
  const [search, setSearch] = useState(query.search);
  const [author, setAuthor] = useState(query.author);

  const [points, setPoints] = useState<[number, number]>([
    query.pointStart ?? pointValues.min,
    query.pointEnd ?? pointValues.max,
  ]);

  const [solvedByDraft, setSolvedByDraft] = useState("");

  // The URL is the source of truth: a Back navigation has to reach the fields.
  useEffect(() => setSearch(query.search), [query.search]);
  useEffect(() => setAuthor(query.author), [query.author]);
  useEffect(() => {
    setPoints([query.pointStart ?? pointValues.min, query.pointEnd ?? pointValues.max]);
  }, [query.pointStart, query.pointEnd, pointValues.min, pointValues.max]);

  const sortOptions: { value: ProblemSort; label: string }[] = [
    { value: "code", label: t("sortCode") },
    { value: "name", label: t("sortName") },
    { value: "points", label: t("sortPoints") },
    { value: "acRate", label: t("sortAcRate") },
    { value: "userCount", label: t("sortUsers") },
    { value: "date", label: t("sortDate") },
  ];

  const set = (patch: Partial<ProblemQuery>) => onApply({ ...query, ...patch, page: 1 });
  const total = activeFilterCount(query);
  const hasPointRange = pointValues.max > pointValues.min;

  const applyText = () =>
    set({
      search: search.trim(),
      author: author.trim(),
      pointStart: hasPointRange && points[0] > pointValues.min ? points[0] : null,
      pointEnd: hasPointRange && points[1] < pointValues.max ? points[1] : null,
    });

  const reset =
    total > 0 ? (
      <Button
        variant="ghost"
        size="sm"
        icon={<RotateCcw size={12} />}
        onClick={() => onApply({ ...EMPTY_QUERY, showTypes: query.showTypes, sort: query.sort })}
      >
        {t("reset")}
      </Button>
    ) : null;

  const body = (
    <div className="px-3 pb-3">
      <div className="py-3">
        <InputGroup
          leading={<Search size={14} aria-hidden />}
          trailing={<Kbd>/</Kbd>}
          className="max-md:h-11"
        >
          <InputGroupInput
            id={`${ids}-search`}
            type="search"
            value={search}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchLabel")}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                applyText();
              }
            }}
          />
        </InputGroup>
        <div className="mt-2">
          <Checkbox
            id={`${ids}-full-text`}
            checked={query.fullText}
            onCheckedChange={(next) => set({ fullText: next })}
            label={t("fullText")}
          />
        </div>
      </div>

      <Group label={t("groupStatus")} count={query.status !== "all" || query.hideSolved ? 1 : 0}>
        <RadioGroup
          name={`${ids}-status`}
          ariaLabel={t("groupStatus")}
          value={query.hideSolved ? "unsolved" : query.status}
          onValueChange={(value) => set({ status: value as ProblemQuery["status"], hideSolved: false })}
          options={[
            { value: "all", label: t("statusAll") },
            { value: "solved", label: t("statusSolved"), disabled: !authenticated },
            { value: "attempted", label: t("statusAttempted"), disabled: !authenticated },
            { value: "unsolved", label: t("statusUnsolved"), disabled: !authenticated },
          ]}
        />
        {authenticated ? (
          <Checkbox
            id={`${ids}-hide-solved`}
            checked={query.hideSolved}
            onCheckedChange={(next) => set({ hideSolved: next, status: "all" })}
            label={t("hideSolved")}
          />
        ) : null}
      </Group>

      <Group label={t("groupCategory")} count={query.category ? 1 : 0}>
        <Select
          ariaLabel={t("groupCategory")}
          value={query.category || "__all__"}
          onValueChange={(value) => set({ category: value === "__all__" ? "" : value })}
          options={[
            { value: "__all__", label: t("categoryAll") },
            ...withCurrent(
              options.groups.map((group) => ({ value: group.name, label: group.fullName })),
              query.category,
            ),
          ]}
        />
      </Group>

      <Group label={t("groupTypes")} count={query.types.length} defaultOpen={query.types.length > 0}>
        <div className="max-h-64 overflow-y-auto pr-1 [scrollbar-color:transparent_transparent] hover:[scrollbar-color:var(--line-strong)_transparent]">
          {options.types.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noTypes")}</p>
          ) : (
            options.types.map((type) => (
              <OptionRow
                key={type.name}
                id={`${ids}-type-${type.name}`}
                checked={query.types.includes(type.name)}
                count={type.count}
                label={type.fullName}
                onChange={(next) =>
                  set({
                    types: next
                      ? [...query.types, type.name]
                      : query.types.filter((name) => name !== type.name),
                  })
                }
              />
            ))
          )}
        </div>
        <Checkbox
          id={`${ids}-show-types`}
          checked={query.showTypes}
          onCheckedChange={(next) => set({ showTypes: next })}
          label={t("showTypes")}
        />
      </Group>

      {hasPointRange ? (
        <Group label={t("groupPoints")} count={query.pointStart !== null || query.pointEnd !== null ? 1 : 0}>
          <div className="flex items-center gap-3">
            <span className="w-9 shrink-0 rounded-sm border border-border bg-secondary px-1 text-center font-mono text-sm tabular-nums text-foreground">
              {points[0]}
            </span>
            <Slider
              aria-label={t("pointRange")}
              min={pointValues.min}
              max={pointValues.max}
              step={1}
              value={points}
              onValueChange={(value) => setPoints([value[0] ?? 0, value[1] ?? 0])}
              onValueCommit={(value) =>
                set({
                  pointStart: (value[0] ?? pointValues.min) > pointValues.min ? (value[0] as number) : null,
                  pointEnd: (value[1] ?? pointValues.max) < pointValues.max ? (value[1] as number) : null,
                })
              }
            />
            <span className="w-9 shrink-0 rounded-sm border border-border bg-secondary px-1 text-center font-mono text-sm tabular-nums text-foreground">
              {points[1]}
            </span>
          </div>
        </Group>
      ) : null}

      <Group label={t("groupSolvedBy")} count={query.solvedBy.length} defaultOpen={query.solvedBy.length > 0}>
        {query.solvedBy.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {query.solvedBy.map((username) => (
              <li key={username}>
                <button
                  type="button"
                  className="inline-flex h-[18px] items-center gap-1 rounded-full border border-primary-line bg-primary-soft px-2 font-mono text-xs text-foreground hover:bg-secondary"
                  onClick={() => set({ solvedBy: query.solvedBy.filter((name) => name !== username) })}
                >
                  {username}
                  <X size={10} aria-hidden />
                  <span className="sr-only">{t("removeUser", { username })}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <Input
          id={`${ids}-solved-by`}
          value={solvedByDraft}
          placeholder={t("solvedByPlaceholder")}
          aria-label={t("groupSolvedBy")}
          onChange={(event) => setSolvedByDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            const username = solvedByDraft.trim();

            if (!username || query.solvedBy.includes(username)) return;
            setSolvedByDraft("");
            set({ solvedBy: [...query.solvedBy, username] });
          }}
        />
        <Checkbox
          id={`${ids}-not-by-me`}
          checked={query.notByMe}
          disabled={!authenticated}
          onCheckedChange={(next) => set({ notByMe: next })}
          label={t("notByMe")}
        />
      </Group>

      <Group label={t("groupAuthor")} count={query.author ? 1 : 0} defaultOpen={!!query.author}>
        <Input
          id={`${ids}-author`}
          value={author}
          placeholder={t("authorPlaceholder")}
          aria-label={t("groupAuthor")}
          onChange={(event) => setAuthor(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              applyText();
            }
          }}
        />
      </Group>

      <Group label={t("groupContest")} count={query.contests.length} defaultOpen={query.contests.length > 0}>
        <MultiSelect
          options={withCurrent(
            options.contests.map((contest) => ({ value: contest.key, label: contest.name })),
            ...query.contests,
          )}
          values={query.contests}
          onChange={(values) => set({ contests: values })}
          searchPlaceholder={t("findContest")}
          emptyText={t("noContests")}
          placeholder={t("anyContest")}
        />
        <Switch
          id={`${ids}-group-by-contest`}
          checked={query.groupByContest}
          onCheckedChange={(next) => set({ groupByContest: next })}
          label={t("groupByContest")}
        />
      </Group>

      <Group label={t("groupEditorial")} count={query.hasEditorial ? 1 : 0}>
        <Checkbox
          id={`${ids}-editorial`}
          checked={query.hasEditorial}
          onCheckedChange={(next) => set({ hasEditorial: next })}
          label={t("hasEditorial")}
        />
      </Group>

      <Group label={t("groupSort")}>
        <Select
          ariaLabel={t("groupSort")}
          value={query.sort}
          onValueChange={(value) => set({ sort: value as ProblemSort })}
          options={sortOptions}
        />
        <Switch
          id={`${ids}-descending`}
          checked={query.descending}
          onCheckedChange={(next) => set({ descending: next })}
          label={t("descending")}
        />
      </Group>

      <div className="flex gap-2 border-t border-border pt-3">
        <Button onClick={applyText} busy={busy} className="flex-1 max-md:h-11">
          {t("go")}
        </Button>
        <Button asChild variant="secondary" icon={<Shuffle size={14} />} className="max-md:h-11">
          <a href={randomHref}>{t("random")}</a>
        </Button>
      </div>
    </div>
  );

  if (bare) return body;

  return (
    <Panel title={t("title")} bodyClassName="p-0" action={reset}>
      {body}
    </Panel>
  );
}

/** The pills above the results, one per live filter. */
export function ActiveFilters({
  query,
  options,
  onApply,
}: {
  query: ProblemQuery;
  options: FilterOptions;
  onApply: (next: ProblemQuery) => void;
}) {
  const t = useTranslations("problems.filters");
  const chips: { key: string; label: string; clear: Partial<ProblemQuery> }[] = [];

  if (query.search) {
    chips.push({ key: "search", label: t("chipSearch", { term: query.search }), clear: { search: "" } });
  }

  if (query.hideSolved) {
    chips.push({ key: "hide", label: t("chipHideSolved"), clear: { hideSolved: false } });
  } else if (query.status !== "all") {
    chips.push({
      key: "status",
      label: t("chipStatus", { status: query.status }),
      clear: { status: "all" },
    });
  }

  if (query.category) {
    const group = options.groups.find((row) => row.name === query.category);
    chips.push({ key: "category", label: group?.fullName ?? query.category, clear: { category: "" } });
  }

  for (const name of query.types) {
    const type = options.types.find((row) => row.name === name);
    chips.push({
      key: `type-${name}`,
      label: type?.fullName ?? name,
      clear: { types: query.types.filter((value) => value !== name) },
    });
  }

  const { pointStart, pointEnd } = query;
  const clearPoints = { pointStart: null, pointEnd: null };

  if (pointStart !== null && pointEnd !== null) {
    const label = t("chipPoints", { start: pointStart, end: pointEnd });
    chips.push({ key: "points", label, clear: clearPoints });
  } else if (pointStart !== null) {
    chips.push({ key: "points", label: t("chipPointsFrom", { start: pointStart }), clear: clearPoints });
  } else if (pointEnd !== null) {
    chips.push({ key: "points", label: t("chipPointsUpTo", { end: pointEnd }), clear: clearPoints });
  }

  for (const username of query.solvedBy) {
    chips.push({
      key: `solved-${username}`,
      label: t("chipSolvedBy", { username }),
      clear: { solvedBy: query.solvedBy.filter((value) => value !== username) },
    });
  }

  if (query.notByMe) chips.push({ key: "notme", label: t("notByMe"), clear: { notByMe: false } });

  if (query.author) {
    chips.push({ key: "author", label: t("chipAuthor", { author: query.author }), clear: { author: "" } });
  }

  for (const key of query.contests) {
    const contest = options.contests.find((row) => row.key === key);
    chips.push({
      key: `contest-${key}`,
      label: contest?.name ?? key,
      clear: { contests: query.contests.filter((value) => value !== key) },
    });
  }

  if (query.hasEditorial) {
    chips.push({ key: "editorial", label: t("hasEditorial"), clear: { hasEditorial: false } });
  }

  if (chips.length === 0) return null;

  return (
    <ul className="mb-3 flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => (
        <li key={chip.key}>
          <button
            type="button"
            className="inline-flex h-[22px] items-center gap-1.5 rounded-full border border-primary-line bg-primary-soft px-2.5 text-sm text-foreground hover:bg-secondary"
            onClick={() => onApply({ ...query, ...chip.clear, page: 1 })}
          >
            {chip.label}
            <X size={11} aria-hidden />
            <span className="sr-only">{t("removeFilter")}</span>
          </button>
        </li>
      ))}
      <li>
        <a
          href={`/problems/${problemQueryString({ ...EMPTY_QUERY, showTypes: query.showTypes })}`}
          className="px-1 text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {t("clear")}
        </a>
      </li>
    </ul>
  );
}
