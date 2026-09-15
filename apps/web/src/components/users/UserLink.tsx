import { getUserCssClass } from "@moj/core/ratings";
import { cn, ratingClass } from "@moj/ui";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { ratingTitleKey } from "./rating-title";

export type UserLinkProps = {
  username: string;
  /** `usernameDisplayOverride || username`, which is what DMOJ renders. */
  displayName?: string | null;
  rating?: number | null;
  /** `profiles.displayRank`: an admin's name is red and semibold whatever the rating. */
  displayRank?: string | null;
  /** A 20px avatar before the name. Pass the gravatar URL the server built. */
  gravatarUrl?: string | null;
  avatarSize?: number;
  /** Skip the link and render the coloured name alone (inside another link). */
  plain?: boolean;
  className?: string;
  children?: ReactNode;
};

/**
 * A username, everywhere one appears: DMOJ's `link_user`, with the rating class
 * carrying the colour and an optional gravatar. `rate-target` keeps DMOJ's ring
 * on the avatar rather than a rainbow.
 */
export function UserLink({
  username,
  displayName,
  rating,
  displayRank,
  gravatarUrl,
  avatarSize = 20,
  plain = false,
  className,
  children,
}: UserLinkProps) {
  const t = useTranslations("users.ratings");
  // `Profile.get_user_css_class`: `rating <rate-class> <display_rank>`, built in
  // one place so a username looks the same wherever it appears.
  const cls = ratingClass(rating);
  const name = children ?? displayName ?? username;

  const label = (
    <span
      className={cn(getUserCssClass(displayRank ?? "user", rating ?? null), className)}
      title={t(ratingTitleKey(rating))}
    >
      {name}
    </span>
  );

  const body = gravatarUrl ? (
    <span className="inline-flex items-center gap-1.5 align-middle">
      <img
        src={gravatarUrl}
        alt=""
        width={avatarSize}
        height={avatarSize}
        className={cn(
          "shrink-0 rounded-full bg-secondary",
          cls === "rate-target" && "ring-1 ring-[var(--rating-target)]",
        )}
        style={{ width: avatarSize, height: avatarSize }}
      />
      {label}
    </span>
  ) : (
    label
  );

  if (plain) return body;

  return (
    <Link href={`/user/${username}/`} className="hover:underline">
      {body}
    </Link>
  );
}
