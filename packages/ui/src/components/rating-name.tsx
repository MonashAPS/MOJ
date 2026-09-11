import type { ReactNode } from "react";
import { cn } from "../cn";

export type RatingClass =
  | "rate-none"
  | "rate-newbie"
  | "rate-amateur"
  | "rate-expert"
  | "rate-candidate-master"
  | "rate-master"
  | "rate-grandmaster"
  | "rate-target";

/** `judge/ratings.py`'s `RATING_VALUES`, which `@moj/core` also carries. The
 *  band a rating falls into is `bisect_right(RATING_VALUES, rating)`. */
export const RATING_VALUES: readonly number[] = [1000, 1300, 1600, 1900, 2400, 3000];

const RATING_CLASSES: readonly RatingClass[] = [
  "rate-newbie",
  "rate-amateur",
  "rate-expert",
  "rate-candidate-master",
  "rate-master",
  "rate-grandmaster",
  "rate-target",
];

const RATING_LEVELS: readonly string[] = [
  "Newbie",
  "Amateur",
  "Expert",
  "Candidate Master",
  "Master",
  "Grandmaster",
  "Target",
];

/** `rating_level(rating)`. */
export function ratingLevel(rating: number): number {
  let level = 0;
  while (level < RATING_VALUES.length && rating >= (RATING_VALUES[level] as number)) level++;
  return level;
}

export function ratingClass(rating: number | null | undefined): RatingClass {
  if (rating === null || rating === undefined) return "rate-none";
  return RATING_CLASSES[ratingLevel(rating)] as RatingClass;
}

export function ratingTitle(rating: number | null | undefined): string {
  if (rating === null || rating === undefined) return "Unrated";
  return RATING_LEVELS[ratingLevel(rating)] as string;
}

/** `rating_progress(rating)`: how far through the current band, in [0, 1]. */
export function ratingProgress(rating: number): number {
  const level = ratingLevel(rating);
  if (level === RATING_VALUES.length) return 1;
  const previous = level === 0 ? 0 : (RATING_VALUES[level - 1] as number);
  const next = RATING_VALUES[level] as number;
  return (rating - previous) / (next - previous);
}

/** Rating colour applies to the username glyphs only, at weight 500, in the mono. */
export function RatingName({
  username,
  rating,
  displayName,
  href,
  isAdmin = false,
  className,
  children,
}: {
  username: string;
  rating?: number | null;
  displayName?: string | null;
  href?: string;
  isAdmin?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const cls = cn("rating font-mono font-medium", ratingClass(rating), isAdmin && "admin", className);
  const text = children ?? displayName ?? username;
  return (
    <span className={cls} title={ratingTitle(rating)}>
      {href ? <a href={href}>{text}</a> : text}
    </span>
  );
}

/** Always signed, always mono. */
export function RatingDelta({ delta, className }: { delta: number; className?: string }) {
  if (!Number.isFinite(delta)) return null;
  return (
    <span
      className={cn(
        "font-mono text-sm font-medium tabular-nums",
        delta >= 0 ? "text-good" : "text-bad",
        className,
      )}
    >
      {delta >= 0 ? "+" : "−"}
      {Math.abs(delta)}
    </span>
  );
}
