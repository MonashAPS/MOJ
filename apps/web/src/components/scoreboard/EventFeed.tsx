"use client";

import type { FeedItem } from "@convex/pages/scoreboard";
import { EASE_OUT } from "@moj/ui";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useLayoutEffect, useMemo, useRef } from "react";
import { contestClock } from "./hall";

const SHIFT_MS = 420;

const CHIP: Record<string, string> = {
  correct: "chipCorrect",
  incorrect: "chipIncorrect",
  pending: "chipPending",
};
const LINE: Record<string, string> = {
  correct: "lineCorrect",
  incorrect: "lineIncorrect",
  pending: "linePending",
};

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
  entries: FeedItem[];
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("contests.hall.feed");
  const listRef = useRef<HTMLOListElement | null>(null);
  const positions = useRef<Map<string, number>>(new Map());
  const painted = useRef(false);

  const fresh = useMemo(() => {
    const keys = new Set(entries.map((entry) => entry.id));
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
    <aside className="hall-feed" data-open={open ? "true" : "false"} aria-label={t("title")}>
      <div className="hall-feed-head">
        <span>{t("title")}</span>
        <span className="hall-spacer" />
        <button
          type="button"
          className="hall-row-edit"
          style={{ position: "static", transform: "none" }}
          title={t("hide")}
          aria-label={t("hide")}
          onClick={onClose}
        >
          <X size={12} strokeWidth={2} aria-hidden />
        </button>
      </div>
      {entries.length === 0 ? <p className="hall-feed-empty">{t("empty")}</p> : null}
      <ol className="hall-feed-list scroll-quiet" ref={listRef}>
        {entries.map((entry) => (
          <li
            key={entry.id}
            data-entry={entry.id}
            data-state={entry.state}
            data-fresh={fresh.has(entry.id) ? "true" : undefined}
            className="hall-feed-item"
          >
            <span className="hall-feed-time">{contestClock(entry.minute * 60)}</span>
            <span className="hall-feed-division" title={entry.divisionName}>
              {entry.divisionName}
            </span>
            <span className="hall-feed-chip">{t(CHIP[entry.state] ?? "chipPending")}</span>
            <span className="hall-feed-line">
              {t.rich(LINE[entry.state] ?? "linePending", {
                name: entry.displayName,
                problem: entry.problem,
                who: (chunks) => <b>{chunks}</b>,
                said: (chunks) => <span className="hall-feed-said">{chunks}</span>,
                what: (chunks) => <b>{chunks}</b>,
              })}
              {entry.verdict ? <span className="hall-feed-said">{` · ${entry.verdict}`}</span> : null}
            </span>
          </li>
        ))}
      </ol>
    </aside>
  );
}
