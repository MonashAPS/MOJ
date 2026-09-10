"use client";

import { cn } from "@moj/ui";
import { GripHorizontal, X } from "lucide-react";
import Link from "next/link";
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
}: {
  contestKey: string;
  contestName: string;
  endsAt: number | null;
  mode: "live" | "spectating" | "virtual";
}) {
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
    if (!box) return;
    const rect = box.getBoundingClientRect();
    dragOffset.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
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
    (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
  }, []);

  if (hidden) return null;

  return (
    <div
      ref={boxRef}
      style={position ?? undefined}
      className={cn(
        "fixed z-(--z-floater) w-[220px] overflow-hidden rounded-md border border-border bg-card shadow-2",
        position ? undefined : "bottom-4 right-4",
      )}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="flex h-7 cursor-grab touch-none items-center gap-2 border-b border-border bg-secondary px-2 active:cursor-grabbing"
      >
        <GripHorizontal size={14} aria-hidden className="text-muted-foreground" />
        <span className="flex-1 truncate font-sans text-xs font-semibold uppercase tracking-[0.08em] text-subtle">
          In contest
        </span>
        <button
          type="button"
          aria-label="Hide the contest timer"
          title="Hide the contest timer until you reload"
          onClick={() => {
            setHidden(true);
            try {
              sessionStorage.setItem(DISMISS_KEY, contestKey);
            } catch {
              // private mode
            }
          }}
          className="flex size-4 items-center justify-center rounded-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X size={12} aria-hidden />
        </button>
      </div>
      <div className="grid gap-1 p-3">
        <Link href={`/contest/${contestKey}`} className="truncate text-sm font-medium text-link">
          {contestName}
        </Link>
        <span className="font-mono text-md font-medium tabular-nums text-foreground">
          {mode === "spectating" ? "spectating" : remaining === null ? "virtual" : formatDuration(remaining)}
        </span>
      </div>
    </div>
  );
}
