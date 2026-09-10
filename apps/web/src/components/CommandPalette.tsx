"use client";

import { api } from "@convex/_generated/api";
import { DialogContent, DialogRoot } from "@moj/ui";
import { useQuery } from "convex/react";
import { Building2, FileCode2, Trophy, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const RECENTS_KEY = "moj-palette-recents";
const MAX_RECENTS = 6;

type Hit = {
  kind: "problem" | "user" | "contest" | "organization";
  id: string;
  title: string;
  subtitle?: string;
  href: string;
};

const ICONS = {
  problem: FileCode2,
  user: User,
  contest: Trophy,
  organization: Building2,
} as const;

const KIND_LABEL = {
  problem: "Problem",
  user: "User",
  contest: "Contest",
  organization: "Organisation",
} as const;

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
    // ignore
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
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
  const [cursor, setCursor] = useState(0);
  const [recents, setRecents] = useState<Hit[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const trimmed = term.trim();
  const results = useQuery(api.search.global, trimmed.length > 0 ? { term: trimmed } : "skip") as
    | Hit[]
    | undefined;

  const items: Hit[] = useMemo(() => {
    if (trimmed.length === 0) return recents;
    return results ?? [];
  }, [trimmed, recents, results]);

  useEffect(() => {
    if (open) {
      setRecents(readRecents());
      setCursor(0);
      const id = setTimeout(() => inputRef.current?.focus(), 20);
      return () => clearTimeout(id);
    }
    setTerm("");
  }, [open]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the point is to reset when the term changes
  useEffect(() => {
    setCursor(0);
  }, [term]);

  const go = useCallback(
    (hit: Hit) => {
      pushRecent(hit);
      onOpenChange(false);
      router.push(hit.href);
    },
    [onOpenChange, router],
  );

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Search" width={560} showClose={false}>
        <input
          ref={inputRef}
          type="search"
          value={term}
          placeholder="Problems, users, contests, organisations"
          aria-label="Search MOJ"
          style={{ width: "100%" }}
          onChange={(event) => setTerm(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setCursor((value) => Math.min(value + 1, Math.max(items.length - 1, 0)));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setCursor((value) => Math.max(value - 1, 0));
            } else if (event.key === "Enter") {
              const hit = items[cursor];
              if (hit) {
                event.preventDefault();
                go(hit);
              }
            }
          }}
        />

        {trimmed.length === 0 && recents.length > 0 ? (
          <div style={{ color: "var(--muted)", fontSize: "0.9em", margin: "10px 2px 4px" }}>Recent</div>
        ) : null}

        {trimmed.length > 0 && results === undefined ? (
          <p style={{ color: "var(--muted)", padding: "12px 2px" }}>Searching...</p>
        ) : null}

        {items.length === 0 && trimmed.length > 0 && results !== undefined ? (
          <p style={{ color: "var(--muted)", padding: "12px 2px" }}>Nothing matched.</p>
        ) : null}

        <ul style={{ listStyle: "none", margin: "6px 0 0", padding: 0 }}>
          {items.map((hit, index) => {
            const Icon = ICONS[hit.kind];
            return (
              <li key={`${hit.kind}-${hit.id}`}>
                <button
                  type="button"
                  onMouseEnter={() => setCursor(index)}
                  onClick={() => go(hit)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    textAlign: "left",
                    padding: "7px 8px",
                    border: 0,
                    borderRadius: "var(--radius)",
                    background: index === cursor ? "var(--surface-2)" : "transparent",
                    color: "var(--ink)",
                    font: "inherit",
                    cursor: "pointer",
                  }}
                >
                  <Icon size={15} aria-hidden style={{ color: "var(--muted)", flex: "none" }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontWeight: 500 }}>{hit.title}</span>
                    {hit.subtitle ? (
                      <span style={{ display: "block", color: "var(--muted)", fontSize: "0.9em" }}>
                        {hit.subtitle}
                      </span>
                    ) : null}
                  </span>
                  <span className="badge">{KIND_LABEL[hit.kind]}</span>
                </button>
              </li>
            );
          })}
        </ul>

        <div
          style={{
            display: "flex",
            gap: 12,
            marginTop: 12,
            paddingTop: 8,
            borderTop: "1px solid var(--line)",
            color: "var(--muted)",
            fontSize: "0.85em",
          }}
        >
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> move
          </span>
          <span>
            <kbd>Enter</kbd> open
          </span>
          <span>
            <kbd>Esc</kbd> close
          </span>
        </div>
      </DialogContent>
    </DialogRoot>
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
