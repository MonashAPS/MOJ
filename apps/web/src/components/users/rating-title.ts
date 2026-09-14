import { ratingClass } from "@moj/ui";

/** `ratingTitle`'s bands, as message keys under `users.ratings`. The names live
 *  in the catalogue rather than in the component library because the library has
 *  no locale to read and the title on a username has to follow the site's. */
const RATING_KEYS: Record<string, string> = {
  "rate-none": "unrated",
  "rate-newbie": "newbie",
  "rate-amateur": "amateur",
  "rate-expert": "expert",
  "rate-candidate-master": "candidateMaster",
  "rate-master": "master",
  "rate-grandmaster": "grandmaster",
  "rate-target": "target",
};

export function ratingTitleKey(rating: number | null | undefined): string {
  return RATING_KEYS[ratingClass(rating)] as string;
}
