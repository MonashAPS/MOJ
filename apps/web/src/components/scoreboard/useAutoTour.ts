"use client";

import { useEffect, useRef } from "react";

/** How long the tour sits still at the top and at the bottom of a division. */
const TOP_MS = 4000;
const BOTTOM_MS = 4000;
/** One screenful of crawl. A long division takes proportionally longer. */
const SCREEN_MS = 12000;

/**
 * The auto-preview tour: sit at the top, crawl to the bottom, sit at the bottom,
 * swap division, repeat.
 *
 * Nothing moves until someone presses play, so the board is safe to leave on a
 * projector while people read it. The crawl runs at a constant speed rather than
 * over a fixed duration, so a division with forty rows does not whip past at an
 * unreadable rate, and the distance is recomputed every frame: an update landing
 * mid-crawl can change the board's height, and the crawl should still end at the
 * real bottom.
 */
export function useAutoTour({
  on,
  restartKey,
  panel,
  advance,
}: {
  on: boolean;
  /** Changing this starts the cycle again — the active division, normally. */
  restartKey: string;
  panel: () => HTMLElement | null;
  advance: () => void;
}): void {
  const advanceRef = useRef(advance);
  advanceRef.current = advance;
  const panelRef = useRef(panel);
  panelRef.current = panel;

  useEffect(() => {
    if (!on) return;

    let timer: number | undefined;
    let frame: number | undefined;
    let cancelled = false;

    const still =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const wait = (ms: number, next: () => void) => {
      timer = window.setTimeout(() => {
        if (!cancelled) next();
      }, ms);
    };

    const crawl = (node: HTMLElement, next: () => void) => {
      const start = node.scrollTop;
      const distance = Math.max(0, node.scrollHeight - node.clientHeight) - start;
      if (still || distance < 8 || !node.clientHeight) {
        node.scrollTop = start + Math.max(0, distance);
        next();
        return;
      }

      const duration = SCREEN_MS * (distance / node.clientHeight);
      let began: number | null = null;

      const step = (now: number) => {
        if (cancelled) return;
        if (began === null) began = now;
        const t = Math.min(1, (now - began) / duration);
        // Ease in and out so the start and the stop are not abrupt, while the
        // long middle stretch stays close to constant speed.
        const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
        const reach = Math.max(0, node.scrollHeight - node.clientHeight) - start;
        node.scrollTop = start + reach * eased;
        if (t < 1) frame = window.requestAnimationFrame(step);
        else next();
      };
      frame = window.requestAnimationFrame(step);
    };

    const cycle = () => {
      const node = panelRef.current();
      if (!node) return;
      node.scrollTop = 0;
      wait(TOP_MS, () => {
        crawl(node, () => {
          wait(BOTTOM_MS, () => {
            advanceRef.current();
          });
        });
      });
    };

    cycle();

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      if (frame !== undefined) window.cancelAnimationFrame(frame);
    };
  }, [on, restartKey]);
}
