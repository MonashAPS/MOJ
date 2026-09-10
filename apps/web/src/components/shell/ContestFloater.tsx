"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatDuration, useCountdown } from "@/lib/countdown";

const STORAGE_KEY = "contest_timer_pos";

/** DMOJ's draggable contest box, bottom left, with the position remembered in
 *  localStorage. Rendered only when the ContestBar is not on screen. */
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
  const dragOffset = useRef<{ x: number; y: number } | null>(null);
  const remaining = useCountdown(endsAt);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const [left, top] = stored.split(":");
        if (left && top) setPosition({ left, top });
      }
    } catch {
      // ignore
    }
  }, []);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const box = boxRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    dragOffset.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    box.setPointerCapture(event.pointerId);
  }, []);

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const offset = dragOffset.current;
    if (!offset) return;
    const left = `${Math.max(0, Math.min(event.clientX - offset.x, window.innerWidth - 40))}px`;
    const top = `${Math.max(0, Math.min(event.clientY - offset.y, window.innerHeight - 30))}px`;
    setPosition({ left, top });
    try {
      localStorage.setItem(STORAGE_KEY, `${left}:${top}`);
    } catch {
      // ignore
    }
  }, []);

  const onPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    dragOffset.current = null;
    boxRef.current?.releasePointerCapture(event.pointerId);
  }, []);

  return (
    <div
      id="contest-info"
      ref={boxRef}
      style={position ?? undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <Link href={`/contest/${contestKey}`} style={{ verticalAlign: "middle" }}>
        {contestName} &ndash;{" "}
        {mode === "spectating" ? (
          "spectating"
        ) : remaining === null ? (
          "virtual"
        ) : (
          <span id="contest-time-remaining">{formatDuration(remaining)}</span>
        )}
      </Link>
    </div>
  );
}
