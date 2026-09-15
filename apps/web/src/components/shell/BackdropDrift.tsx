"use client";

import { useEffect } from "react";

/** How far the backdrop moves for a pixel of scroll. Low on purpose: the
 *  constellations should lag the page, not slide around behind it. */
const FACTOR = 0.12;

/**
 * Drifts the page's backdrop against the scroll.
 *
 * This was a scroll-driven CSS animation first, which is the tidier answer and
 * runs without a listener, but Firefox does not run those, so the backdrop sat
 * perfectly still for anyone not on Chrome. One passive listener writing one
 * custom property is worth a effect that actually happens.
 *
 * The write is a transform on a single fixed layer, so it stays on the
 * compositor and never triggers layout.
 */
export function BackdropDrift() {
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

    if (reduced.matches) return;

    let frame = 0;

    const apply = () => {
      frame = 0;
      document.body.style.setProperty("--backdrop-shift", `${-window.scrollY * FACTOR}px`);
    };

    const onScroll = () => {
      // One write a frame however often the browser fires the event.
      if (!frame) frame = requestAnimationFrame(apply);
    };

    apply();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", onScroll);

      if (frame) cancelAnimationFrame(frame);
      document.body.style.removeProperty("--backdrop-shift");
    };
  }, []);

  return null;
}
