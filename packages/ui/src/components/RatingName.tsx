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
  const cls = cn("rating", ratingClass(rating), isAdmin && "admin", className);
  const text = children ?? displayName ?? username;
  if (!href) {
    return (
      <span className={cls} title={ratingTitle(rating)}>
        {text}
      </span>
    );
  }
  return (
    <span className={cls} title={ratingTitle(rating)}>
      <a href={href}>{text}</a>
    </span>
  );
}
