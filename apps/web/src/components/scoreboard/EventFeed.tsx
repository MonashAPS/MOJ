"use client";

import { EASE_OUT } from "@moj/ui";
import { X } from "lucide-react";
import { useLayoutEffect, useMemo, useRef } from "react";
import { contestClock, type FeedEntry } from "./hall";

const SHIFT_MS = 420;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * The event feed: the solves and the outstanding submissions of every division
 * in one list, newest first, each tagged with the division it came from.
 *
 * Entries are re-used rather than rebuilt between updates and the ones that
 * shifted are animated from their old offset to their new one — a FLIP — so an
 * arrival reads as the column moving down rather than as the text being
 * rewritten in place.
 */
export function EventFeed({
  entries,
  open,
  onClose,
}: {
  entries: FeedEntry[];
  open: boolean;
  onClose: () => void;
}) {
  const listRef = useRef<HTMLOListElement | null>(null);
  const positions = useRef<Map<string, number>>(new Map());
  const painted = useRef(false);

  const fresh = useMemo(() => {
    const keys = new Set(entries.map((entry) => entry.key));
    const arrived = new Set<string>();
    if (painted.current) {
      for (const key of keys) if (!positions.current.has(key)) arrived.add(key);
    }
    return arrived;
  }, [entries]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const still = prefersReducedMotion();
    const next = new Map<string, number>();
    for (const node of list.querySelectorAll<HTMLLIElement>("li[data-entry]")) {
      const key = node.dataset.entry;
      if (!key) continue;
      const top = node.offsetTop;
      next.set(key, top);
      const before = positions.current.get(key);
      if (still || before === undefined) continue;
      const delta = before - top;
      if (Math.abs(delta) < 2 || typeof node.animate !== "function") continue;
      node.animate([{ transform: `translateY(${delta}px)` }, { transform: "none" }], {
        duration: SHIFT_MS,
        easing: `cubic-bezier(${EASE_OUT.join(",")})`,
      });
    }
    positions.current = next;
    painted.current = true;
  });

  return (
    <aside className="hall-feed" data-open={open ? "true" : "false"} aria-label="Event feed">
      <div className="hall-feed-head">
        <span>Event feed</span>
        <span className="hall-spacer" />
        <button
          type="button"
          className="hall-row-edit"
          style={{ position: "static", transform: "none" }}
          title="Hide the event feed"
          aria-label="Hide the event feed"
          onClick={onClose}
        >
          <X size={12} strokeWidth={2} aria-hidden />
        </button>
      </div>
      {entries.length === 0 ? (
        <p className="hall-feed-empty">Solves appear here as they land.</p>
      ) : null}
      <ol className="hall-feed-list scroll-quiet" ref={listRef}>
        {entries.map((entry) => (
          <li
            key={entry.key}
            data-entry={entry.key}
            data-state={entry.state}
            data-fresh={fresh.has(entry.key) ? "true" : undefined}
            className="hall-feed-item"
          >
            <span className="hall-feed-time">{entry.time === null ? "—" : contestClock(entry.time)}</span>
            <span className="hall-feed-division" title={entry.divisionName}>
              {entry.divisionName}
            </span>
            <span className="hall-feed-chip">{entry.state === "correct" ? "Solved" : "Pending"}</span>
            <span className="hall-feed-line">
              <b>{entry.displayName}</b>
              <span className="hall-feed-said">
                {entry.state === "correct" ? " solved problem " : " is waiting on problem "}
              </span>
              <b>{entry.problem}</b>
              {entry.note ? <span className="hall-feed-said">{` · ${entry.note}`}</span> : null}
            </span>
          </li>
        ))}
      </ol>
    </aside>
  );
}
