"use client";

import { api } from "@convex/_generated/api";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@moj/ui";
import { useQuery } from "convex/react";
import {
  Building2,
  Dice5,
  History,
  ListChecks,
  Moon,
  Puzzle,
  Search,
  Trophy,
  User,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

const RECENTS_KEY = "moj-palette-recents";
const MAX_RECENTS = 6;
const PER_GROUP = 6;
const DEBOUNCE_MS = 120;

type Hit = {
  kind: "problem" | "user" | "contest" | "organization";
  id: string;
  title: string;
  subtitle?: string;
  href: string;
};

const ICONS = {
  problem: Puzzle,
  user: User,
  contest: Trophy,
  organization: Building2,
} as const;

const GROUPS: Array<{ kind: Hit["kind"]; label: string }> = [
  { kind: "problem", label: "Problems" },
  { kind: "contest", label: "Contests" },
  { kind: "user", label: "Users" },
  { kind: "organization", label: "Organizations" },
];

const PAGES = [
  { label: "Problems", href: "/problems/", icon: Puzzle },
  { label: "Submissions", href: "/submissions/", icon: ListChecks },
  { label: "Contests", href: "/contests/", icon: Trophy },
  { label: "Users", href: "/users/", icon: Users },
];

function readRecents(): Hit[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Hit[]).slice(0, MAX_RECENTS) : [];
  } catch {
    return [];
  }
}

function pushRecent(hit: Hit) {
  try {
    const current = readRecents().filter((item) => item.href !== hit.href);
    localStorage.setItem(RECENTS_KEY, JSON.stringify([hit, ...current].slice(0, MAX_RECENTS)));
  } catch {
    // private mode
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

function toggleTheme() {
  const root = document.documentElement;
  const current = root.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  root.setAttribute("data-theme", next);
  try {
    localStorage.setItem("moj-theme", next);
  } catch {
    // private mode
  }
}

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [recents, setRecents] = useState<Hit[]>([]);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(term.trim()), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [term]);

  useEffect(() => {
    if (open) {
      setRecents(readRecents());
      return;
    }
    setTerm("");
    setDebounced("");
  }, [open]);

  const results = useQuery(api.search.global, debounced.length > 0 ? { term: debounced } : "skip") as
    | Hit[]
    | undefined;

  const grouped = useMemo(() => {
    const map = new Map<Hit["kind"], Hit[]>();
    for (const hit of results ?? []) {
      const bucket = map.get(hit.kind) ?? [];
      if (bucket.length < PER_GROUP) bucket.push(hit);
      map.set(hit.kind, bucket);
    }
    return map;
  }, [results]);

  const go = useCallback(
    (href: string, hit?: Hit) => {
      if (hit) pushRecent(hit);
      onOpenChange(false);
      router.push(href);
    },
    [onOpenChange, router],
  );

  const searching = debounced.length > 0 && results === undefined;
  const nothing = debounced.length > 0 && results !== undefined && results.length === 0;

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} shouldFilter={false}>
      {/* The Convex search index has already ranked these, so cmdk's own filter
          is off and the list is shown as it arrives. */}
      <CommandInput
        value={term}
        onValueChange={setTerm}
        placeholder="Problems, contests, users, organizations…"
        autoFocus
      />
      <CommandList className="scroll-quiet">
        {searching ? <p className="px-4 py-8 text-center text-sm text-muted-foreground">Searching…</p> : null}

        {nothing ? (
          <CommandEmpty>
            No matches for <em className="not-italic font-medium text-foreground">{debounced}</em>.
          </CommandEmpty>
        ) : null}

        {debounced.length === 0 && recents.length > 0 ? (
          <CommandGroup heading="Recent">
            {recents.map((hit) => {
              const Icon = ICONS[hit.kind];
              return (
                <CommandItem
                  key={`recent-${hit.kind}-${hit.id}`}
                  value={`recent ${hit.title}`}
                  onSelect={() => go(hit.href, hit)}
                >
                  <History aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{hit.title}</span>
                  <Icon aria-hidden className="opacity-60" />
                </CommandItem>
              );
            })}
          </CommandGroup>
        ) : null}

        {GROUPS.map(({ kind, label }) => {
          const hits = grouped.get(kind) ?? [];
          if (hits.length === 0) return null;
          const Icon = ICONS[kind];
          return (
            <CommandGroup key={kind} heading={label}>
              {hits.map((hit) => (
                <CommandItem
                  key={`${hit.kind}-${hit.id}`}
                  value={`${kind} ${hit.title} ${hit.subtitle ?? ""}`}
                  onSelect={() => go(hit.href, hit)}
                >
                  <Icon aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{hit.title}</span>
                  {hit.subtitle ? <CommandShortcut>{hit.subtitle}</CommandShortcut> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}

        <CommandGroup heading="Pages">
          {PAGES.map((page) => (
            <CommandItem key={page.href} value={`page ${page.label}`} onSelect={() => go(page.href)}>
              <page.icon aria-hidden />
              {page.label}
            </CommandItem>
          ))}
          {debounced.length > 0 ? (
            <CommandItem
              value="search all problems"
              onSelect={() => go(`/problems/?search=${encodeURIComponent(debounced)}`)}
            >
              <Search aria-hidden />
              Search all problems
            </CommandItem>
          ) : null}
        </CommandGroup>

        <CommandGroup heading="Actions">
          <CommandItem value="action random problem" onSelect={() => go("/problems/random/")}>
            <Dice5 aria-hidden />
            Random problem
          </CommandItem>
          <CommandItem
            value="action toggle dark mode"
            onSelect={() => {
              toggleTheme();
              onOpenChange(false);
            }}
          >
            <Moon aria-hidden />
            Toggle dark mode
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

/** Global Ctrl+K / "/" binding. Returns the open state so the nav can also
 *  trigger it from its search button. */
export function useCommandPalette(): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isShortcut = (event.key === "k" || event.key === "K") && (event.metaKey || event.ctrlKey);
      const isSlash = event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey;
      if (isShortcut || (isSlash && !isTypingTarget(event.target))) {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return [open, setOpen];
}
