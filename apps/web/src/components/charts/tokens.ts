"use client";

import { useEffect, useState } from "react";

/**
 * Chart.js paints into a canvas, so it cannot inherit a CSS custom property.
 * These hooks resolve the tokens once and again whenever the theme changes, so
 * a chart is as theme-aware as the rest of the page and still holds no hex.
 */
function resolve(names: readonly string[]): string[] {
  if (typeof window === "undefined") return names.map(() => "");
  const styles = getComputedStyle(document.documentElement);
  return names.map((name) => styles.getPropertyValue(name).trim());
}

export function useTokenColors(names: readonly string[]): string[] {
  const [colors, setColors] = useState<string[]>(() => names.map(() => ""));

  useEffect(() => {
    const read = () => setColors(resolve(names));
    read();

    // An explicit choice stamps `data-theme`; "system" changes come from the
    // media query. Both re-read; neither re-renders anything else.
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", read);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", read);
    };
    // The name list is a module constant at every call site.
  }, [names]);

  return colors;
}

/** The five families DMOJ's submission-result pie uses, as MOJ tokens. */
export const RESULT_TOKENS = ["--v-good", "--v-bad", "--brand-royal", "--v-neutral", "--v-warn"] as const;

/** A categorical ramp for the language charts, built out of the rating and
 *  verdict hues so it reads as the same system and flips with the theme. */
export const CATEGORICAL_TOKENS = [
  "--brand-royal",
  "--rating-amateur",
  "--rating-master",
  "--rating-candidate-master",
  "--brand-cyan",
  "--v-bad",
  "--rating-expert",
  "--v-warn",
  "--v-good",
  "--rating-grandmaster",
  "--v-neutral",
  "--rating-target",
] as const;

/** Axis, grid and label colours, so a chart's chrome matches the page's, plus the
 *  royal a bar is filled with. Module constants: `useTokenColors` keys its effect
 *  on the array, so a literal built inside a render would loop. */
export const CHROME_TOKENS = ["--ink", "--muted", "--line", "--surface", "--brand-royal"] as const;
