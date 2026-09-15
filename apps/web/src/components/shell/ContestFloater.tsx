"use client";

import type { ContestBarProblem } from "@convex/contests";
import { cn } from "@moj/ui";
import { ChevronDown, GripHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatDuration, useCountdown } from "@/lib/countdown";

const STORAGE_KEY = "contest_timer_pos";

const DISMISS_KEY = "contest_timer_hidden";

/** DMOJ's draggable contest box, with its position remembered in localStorage.
 *  Rendered only when the ContestBar is not on screen. */
export function ContestFloater({
  contestKey,
  contestName,
  endsAt,
  mode,
  problems,
}: {
  contestKey: string;
  contestName: string;
  endsAt: number | null;
  mode: "live" | "spectating" | "virtual";
  problems: ContestBarProblem[];
}) {
  const t = useTranslations("common.contestBar");
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ left: string; top: string } | null>(null);
  const [hidden, setHidden] = useState(false);
  const dragOffset = useRef<{ x: number; y: number } | null>(null);
  const remaining = useCountdown(endsAt);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);

      if (stored) {
        const [left, top] = stored.split(":");

        if (left && top) setPosition({ left, top });
      }

      if (sessionStorage.getItem(DISMISS_KEY) === contestKey) setHidden(true);
    } catch {
      // private mode
    }
  }, [contestKey]);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const box = boxRef.current;

    // The titlebar carries a button. Capturing the pointer for a drag retargets
    // the click that follows to the bar itself, which is why pressing the close
    // button did nothing at all.
    if (!box || (event.target instanceof Element && event.target.closest("button"))) return;
    const rect = box.getBoundingClientRect();
    dragOffset.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const offset = dragOffset.current;

    if (!offset) return;
    const left = `${Math.max(0, Math.min(event.clientX - offset.x, window.innerWidth - 80))}px`;
    const top = `${Math.max(0, Math.min(event.clientY - offset.y, window.innerHeight - 40))}px`;
    setPosition({ left, top });

    try {
      localStorage.setItem(STORAGE_KEY, `${left}:${top}`);
    } catch {
      // private mode
    }
  }, []);

  const onPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    dragOffset.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  // Closed, the box does not go away: it parks under the nav as the contest's
  // name, because being in a contest is not something to lose track of. The bar
  // along its bottom pulls it back out.
  if (hidden) {
    return (
      <div className="fixed right-4 top-[calc(var(--header-height,var(--nav-height))+var(--space-2))] z-(--z-floater) w-[200px] overflow-hidden rounded-md border border-border bg-card shadow-2">
        <Link
          href={`/contest/${contestKey}`}
          className="block truncate px-3 py-2 text-sm font-medium text-link"
        >
          {contestName}
        </Link>
        <button
          type="button"
          aria-label={t("showTimer")}
          title={t("showTimer")}
          onClick={() => {
            setHidden(false);

            try {
              sessionStorage.removeItem(DISMISS_KEY);
            } catch {
              // private mode
            }
          }}
          className="flex h-6 w-full items-center justify-center border-t border-border bg-secondary text-muted-foreground hover:bg-well hover:text-foreground"
        >
          <ChevronDown size={14} aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div
      ref={boxRef}
      style={position ?? undefined}
      className={cn(
        "fixed z-(--z-floater) w-[240px] overflow-hidden rounded-md border border-border bg-card shadow-2",
        position ? undefined : "bottom-4 right-4",
      )}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="flex h-7 cursor-grab touch-none items-center gap-2 bg-titlebar px-2 text-titlebar-ink active:cursor-grabbing"
      >
        <GripHorizontal size={14} aria-hidden className="text-titlebar-ink-2" />
        <span className="flex-1 truncate font-sans text-xs font-semibold uppercase tracking-label">
          {t("floater")}
        </span>
        <button
          type="button"
          aria-label={t("hideTimer")}
          title={t("hideTimerHint")}
          onClick={() => {
            setHidden(true);

            try {
              sessionStorage.setItem(DISMISS_KEY, contestKey);
            } catch {
              // private mode
            }
          }}
          className="flex size-4 items-center justify-center rounded-xs text-titlebar-ink-2 hover:bg-white/15 hover:text-titlebar-ink"
        >
          <X size={12} aria-hidden />
        </button>
      </div>
      <div className="grid gap-1 p-3">
        <Link href={`/contest/${contestKey}`} className="truncate text-sm font-medium text-link">
          {contestName}
        </Link>
        <span className="font-mono text-md font-medium tabular-nums text-foreground">
          {mode === "spectating"
            ? t("spectating")
            : remaining === null
              ? t("virtual")
              : formatDuration(remaining)}
        </span>
      </div>

      {/* The problems, so that being out on another page is not a reason to have
          to navigate back to find them. */}
      {problems.length > 0 ? (
        <ol className="grid border-t border-border">
          {problems.map((problem) => (
            <li key={problem.code} className="border-b border-border last:border-b-0">
              <Link
                href={`/problem/${problem.code}/`}
                className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-secondary"
              >
                <span
                  aria-hidden
                  className={cn(
                    "size-2 shrink-0 rounded-xs",
                    problem.state === "solved"
                      ? "bg-good"
                      : problem.state === "partial"
                        ? "bg-warn"
                        : problem.state === "attempted"
                          ? "bg-bad"
                          : "bg-well",
                  )}
                />
                <span className="font-mono text-sm text-muted-foreground">{problem.label}</span>
                <span className="min-w-0 flex-1 truncate">{problem.name}</span>
              </Link>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
