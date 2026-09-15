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

/** One rating band: its name, its colour class and the rating it starts at. */
interface RatingBand {
  readonly name: string;
  readonly cssClass: RatingClass;
  /** Lowest rating in the band; the bottom band has none. */
  readonly floor: number | null;
}

const RATING_BANDS = [
  { name: "Newbie", cssClass: "rate-newbie", floor: null },
  { name: "Amateur", cssClass: "rate-amateur", floor: 1000 },
  { name: "Expert", cssClass: "rate-expert", floor: 1300 },
  { name: "Candidate Master", cssClass: "rate-candidate-master", floor: 1600 },
  { name: "Master", cssClass: "rate-master", floor: 1900 },
  { name: "Grandmaster", cssClass: "rate-grandmaster", floor: 2400 },
  { name: "Target", cssClass: "rate-target", floor: 3000 },
] as const satisfies readonly RatingBand[];

/** `judge/ratings.py`'s `RATING_VALUES`, which `@moj/core` also carries. The
 *  band a rating falls into is `bisect_right(RATING_VALUES, rating)`. */
export const RATING_VALUES: readonly number[] = RATING_BANDS.flatMap((band) =>
  band.floor === null ? [] : [band.floor],
);

/** The band a rating falls in: the last one whose floor it reaches. */
function ratingBand(rating: number): RatingBand {
  let band: RatingBand = RATING_BANDS[0];

  for (const candidate of RATING_BANDS) {
    if (candidate.floor !== null && rating >= candidate.floor) band = candidate;
  }

  return band;
}

/** `rating_level(rating)`. */
export function ratingLevel(rating: number): number {
  let level = 0;

  for (const band of RATING_BANDS) {
    if (band.floor !== null && rating >= band.floor) level++;
  }

  return level;
}

export function ratingClass(rating: number | null | undefined): RatingClass {
  if (rating === null || rating === undefined) return "rate-none";

  return ratingBand(rating).cssClass;
}

export function ratingTitle(rating: number | null | undefined): string {
  if (rating === null || rating === undefined) return "Unrated";

  return ratingBand(rating).name;
}

/** `rating_progress(rating)`: how far through the current band, in [0, 1]. */
export function ratingProgress(rating: number): number {
  let floor = 0;

  for (const band of RATING_BANDS) {
    if (band.floor === null) continue;

    if (rating < band.floor) return (rating - floor) / (band.floor - floor);

    floor = band.floor;
  }

  return 1;
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
