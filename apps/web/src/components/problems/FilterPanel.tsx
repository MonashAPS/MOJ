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

const SORT_OPTIONS: { value: ProblemSort; label: string }[] = [
  { value: "code", label: "Code" },
  { value: "name", label: "Name" },
  { value: "points", label: "Points" },
  { value: "acRate", label: "AC rate" },
  { value: "userCount", label: "Users" },
  { value: "date", label: "Date" },
];

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
        Reset
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
            placeholder="Search problems…"
            aria-label="Search problems"
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
            label="Full text search"
          />
        </div>
      </div>

      <Group label="Status" count={query.status !== "all" || query.hideSolved ? 1 : 0}>
        <RadioGroup
          name={`${ids}-status`}
          ariaLabel="Status"
          value={query.hideSolved ? "unsolved" : query.status}
          onValueChange={(value) => set({ status: value as ProblemQuery["status"], hideSolved: false })}
          options={[
            { value: "all", label: "All" },
            { value: "solved", label: "Solved", disabled: !authenticated },
            { value: "attempted", label: "Attempted", disabled: !authenticated },
            { value: "unsolved", label: "Unsolved", disabled: !authenticated },
          ]}
        />
        {authenticated ? (
          <Checkbox
            id={`${ids}-hide-solved`}
            checked={query.hideSolved}
            onCheckedChange={(next) => set({ hideSolved: next, status: "all" })}
            label="Hide solved problems"
          />
        ) : null}
      </Group>

      <Group label="Category" count={query.category ? 1 : 0}>
        <Select
          ariaLabel="Category"
          value={query.category || "__all__"}
          onValueChange={(value) => set({ category: value === "__all__" ? "" : value })}
          options={[
            { value: "__all__", label: "All" },
            ...withCurrent(
              options.groups.map((group) => ({ value: group.name, label: group.fullName })),
              query.category,
            ),
          ]}
        />
      </Group>

      <Group label="Types" count={query.types.length} defaultOpen={query.types.length > 0}>
        <div className="max-h-64 overflow-y-auto pr-1 [scrollbar-color:transparent_transparent] hover:[scrollbar-color:var(--line-strong)_transparent]">
          {options.types.length === 0 ? (
            <p className="text-sm text-muted-foreground">No problem types are defined.</p>
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
          label="Show problem types"
        />
      </Group>

      {hasPointRange ? (
        <Group label="Points" count={query.pointStart !== null || query.pointEnd !== null ? 1 : 0}>
          <div className="flex items-center gap-3">
            <span className="w-9 shrink-0 rounded-sm border border-border bg-secondary px-1 text-center font-mono text-sm tabular-nums text-foreground">
              {points[0]}
            </span>
            <Slider
              aria-label="Point range"
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

      <Group label="Solved by" count={query.solvedBy.length} defaultOpen={query.solvedBy.length > 0}>
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
                  <span className="sr-only">Remove {username}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <Input
          id={`${ids}-solved-by`}
          value={solvedByDraft}
          placeholder="Add a username…"
          aria-label="Solved by"
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
          label="and not by me"
        />
      </Group>

      <Group label="Author" count={query.author ? 1 : 0} defaultOpen={!!query.author}>
        <Input
          id={`${ids}-author`}
          value={author}
          placeholder="Username…"
          aria-label="Author"
          onChange={(event) => setAuthor(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              applyText();
            }
          }}
        />
      </Group>

      <Group label="Contest" count={query.contests.length} defaultOpen={query.contests.length > 0}>
        <MultiSelect
          options={withCurrent(
            options.contests.map((contest) => ({ value: contest.key, label: contest.name })),
            ...query.contests,
          )}
          values={query.contests}
          onChange={(values) => set({ contests: values })}
          searchPlaceholder="Find a contest…"
          emptyText="No contests match."
          placeholder="Any contest"
        />
        <Switch
          id={`${ids}-group-by-contest`}
          checked={query.groupByContest}
          onCheckedChange={(next) => set({ groupByContest: next })}
          label="Group by contest"
        />
      </Group>

      <Group label="Editorial" count={query.hasEditorial ? 1 : 0}>
        <Checkbox
          id={`${ids}-editorial`}
          checked={query.hasEditorial}
          onCheckedChange={(next) => set({ hasEditorial: next })}
          label="Has editorial"
        />
      </Group>

      <Group label="Sort">
        <Select
          ariaLabel="Sort"
          value={query.sort}
          onValueChange={(value) => set({ sort: value as ProblemSort })}
          options={SORT_OPTIONS}
        />
        <Switch
          id={`${ids}-descending`}
          checked={query.descending}
          onCheckedChange={(next) => set({ descending: next })}
          label="Descending"
        />
      </Group>

      <div className="flex gap-2 border-t border-border pt-3">
        <Button onClick={applyText} busy={busy} className="flex-1 max-md:h-11">
          Go
        </Button>
        <Button asChild variant="secondary" icon={<Shuffle size={14} />} className="max-md:h-11">
          <a href={randomHref}>Random</a>
        </Button>
      </div>
    </div>
  );

  if (bare) return body;
  return (
    <Panel title="Filters" bodyClassName="p-0" action={reset}>
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
  const chips: { key: string; label: string; clear: Partial<ProblemQuery> }[] = [];
  if (query.search) chips.push({ key: "search", label: `“${query.search}”`, clear: { search: "" } });
  if (query.hideSolved) chips.push({ key: "hide", label: "Hide solved", clear: { hideSolved: false } });
  else if (query.status !== "all") {
    chips.push({ key: "status", label: `Status: ${query.status}`, clear: { status: "all" } });
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
  if (query.pointStart !== null || query.pointEnd !== null) {
    chips.push({
      key: "points",
      label: `${query.pointStart ?? "min"}–${query.pointEnd ?? "max"} points`,
      clear: { pointStart: null, pointEnd: null },
    });
  }
  for (const username of query.solvedBy) {
    chips.push({
      key: `solved-${username}`,
      label: `Solved by ${username}`,
      clear: { solvedBy: query.solvedBy.filter((value) => value !== username) },
    });
  }
  if (query.notByMe) chips.push({ key: "notme", label: "and not by me", clear: { notByMe: false } });
  if (query.author) chips.push({ key: "author", label: `Author: ${query.author}`, clear: { author: "" } });
  for (const key of query.contests) {
    const contest = options.contests.find((row) => row.key === key);
    chips.push({
      key: `contest-${key}`,
      label: contest?.name ?? key,
      clear: { contests: query.contests.filter((value) => value !== key) },
    });
  }
  if (query.hasEditorial) {
    chips.push({ key: "editorial", label: "Has editorial", clear: { hasEditorial: false } });
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
            <span className="sr-only">Remove this filter</span>
          </button>
        </li>
      ))}
      <li>
        <a
          href={`/problems/${problemQueryString({ ...EMPTY_QUERY, showTypes: query.showTypes })}`}
          className="px-1 text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Clear filters
        </a>
      </li>
    </ul>
  );
}
