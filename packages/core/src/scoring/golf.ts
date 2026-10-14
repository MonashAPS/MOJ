/**
 * Code golf: the shortest accepted source scores the problem's points, and a
 * longer one scores in proportion, `points × shortest / bytes`. Every language
 * competes on the same count, and only a fully accepted submission scores.
 */

import type { ScoringRule } from "./types";

/**
 * The length golf scores: UTF-8 bytes, with trailing whitespace not counted.
 * Counted by hand because `@moj/core` assumes no `TextEncoder`; a lone
 * surrogate counts three, the width of the U+FFFD an encoder writes for it.
 */
export function sourceBytes(source: string): number {
  let bytes = 0;

  for (const char of source.trimEnd()) {
    const code = char.codePointAt(0) ?? 0;

    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code < 0x10000) bytes += 3;
    else bytes += 4;
  }

  return bytes;
}

export const golfScoring: ScoringRule<"golf"> = {
  measure(_scoring, submission) {
    if (submission.result !== "AC") return null;

    return { kind: "golf", bytes: sourceBytes(submission.source) };
  },

  improve(_scoring, best, measure) {
    if (best !== null && best.bytes <= measure.bytes) return best;

    return { kind: "golf", bytes: measure.bytes };
  },

  holds(_scoring, best, measure) {
    return measure.bytes <= best.bytes;
  },

  points(_scoring, measure, best, problemPoints) {
    if (measure === null) return 0;

    // A best that has not caught up with this measure yet cannot ask for more
    // than full marks; an empty source is as short as anything gets.
    const shortest = Math.min(best?.bytes ?? measure.bytes, measure.bytes);

    if (measure.bytes === 0) return problemPoints;

    return (problemPoints * shortest) / measure.bytes;
  },
};
