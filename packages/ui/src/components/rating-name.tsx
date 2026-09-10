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

// DMOJ's thresholds, from judge/ratings.py.
export function ratingClass(rating: number | null | undefined): RatingClass {
  if (rating === null || rating === undefined) return "rate-none";
  if (rating >= 3000) return "rate-target";
  if (rating >= 2600) return "rate-grandmaster";
  if (rating >= 2200) return "rate-master";
  if (rating >= 1800) return "rate-candidate-master";
  if (rating >= 1500) return "rate-expert";
  if (rating >= 1200) return "rate-amateur";
  return "rate-newbie";
}

export function ratingTitle(rating: number | null | undefined): string {
  if (rating === null || rating === undefined) return "Unrated";
  if (rating >= 3000) return "Target";
  if (rating >= 2600) return "Grandmaster";
  if (rating >= 2200) return "Master";
  if (rating >= 1800) return "Candidate Master";
  if (rating >= 1500) return "Expert";
  if (rating >= 1200) return "Amateur";
  return "Newbie";
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
