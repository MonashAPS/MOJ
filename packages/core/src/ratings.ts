/**
 * Elo-MMR ratings, ported from judge/ratings.py.
 *
 * The algorithm is Aram Ebtekar and Paul Liu's Elo-MMR as DMOJ implements it:
 * a performance is solved for by bisection on a sum of tanh terms, then the
 * skill mean is solved for against the performance history, and the displayed
 * rating is the mean minus a confidence margin that shrinks with experience.
 *
 * Every constant, every loop bound and the divide-and-conquer that exploits the
 * monotonicity of performance in rank are DMOJ's.
 */

import type { ContestRow, Id } from "./types";

/* -------------------------------------------------------------------------- */
/* Constants (judge/ratings.py:12)                                            */
/* -------------------------------------------------------------------------- */

export const BETA2 = 328.33 ** 2;

/** A newcomer's rating when applying the rating floor/ceiling. */
export const RATING_INIT = 1200;

export const MEAN_INIT = 1500;

export const VAR_INIT = 350 ** 2 * (BETA2 / 212 ** 2);

export const SD_INIT = Math.sqrt(VAR_INIT);

export const VALID_RANGE: readonly [number, number] = [MEAN_INIT - 20 * SD_INIT, MEAN_INIT + 20 * SD_INIT];

export const VAR_PER_CONTEST = 1219.047619 * (BETA2 / 212 ** 2);

export const VAR_LIM = (Math.sqrt(VAR_PER_CONTEST ** 2 + 4 * BETA2 * VAR_PER_CONTEST) - VAR_PER_CONTEST) / 2;

export const SD_LIM = Math.sqrt(VAR_LIM);

export const TANH_C = Math.sqrt(3) / Math.PI;

/** `settings.DMOJ_CONTEST_PERF_CEILING_INCREMENT`. */
export const CONTEST_PERF_CEILING_INCREMENT = 400;

/* -------------------------------------------------------------------------- */
/* Core maths                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * `tie_ranker(iterable, key)` (ratings.py:24).
 *
 * Yields the fractional rank of every item of an already-sorted sequence:
 * a run of `k` tied items all get `rank + (k - 1) / 2`.
 */
export function tieRanker<T>(items: readonly T[], key: (item: T) => unknown[]): number[] {
  const ranks: number[] = [];
  let rank = 0;
  let delta = 1;
  let last: unknown[] | null = null;
  let buffered = 0;

  for (const item of items) {
    const current = key(item);

    if (last === null || !sameKey(current, last)) {
      for (let i = 0; i < buffered; i++) ranks.push(rank + (delta - 1) / 2);
      rank += delta;
      delta = 0;
      buffered = 0;
    }

    delta += 1;
    buffered += 1;
    last = current;
  }

  for (let i = 0; i < buffered; i++) ranks.push(rank + (delta - 1) / 2);

  return ranks;
}

function sameKey(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;

  return true;
}

/** One `(mu, sd, weight)` term of the tanh sum. */
export type TanhTerm = readonly [mu: number, sd: number, weight: number];

/** `eval_tanhs(tanh_terms, x)` (ratings.py:44). */
export function evalTanhs(terms: readonly TanhTerm[], x: number): number {
  let total = 0;

  for (const [mu, sd, weight] of terms) total += (weight / sd) * Math.tanh((x - mu) / (2 * sd));

  return total;
}

/**
 * `solve(tanh_terms, y_tg, lin_factor, bounds)` (ratings.py:48).
 *
 * Bisection down to a width of 2, then one linear interpolation step.
 */
export function solve(
  terms: readonly TanhTerm[],
  yTarget: number,
  linFactor = 0,
  bounds: readonly [number, number] = VALID_RANGE,
): number {
  let [left, right] = bounds;
  let leftY: number | null = null;
  let rightY: number | null = null;

  while (right - left > 2) {
    const x = (left + right) / 2;
    const y = linFactor * x + evalTanhs(terms, x);

    if (y > yTarget) {
      right = x;
      rightY = y;
    } else if (y < yTarget) {
      left = x;
      leftY = y;
    } else {
      return x;
    }
  }

  if (leftY === null) leftY = linFactor * left + evalTanhs(terms, left);

  if (yTarget <= leftY) return left;

  if (rightY === null) rightY = linFactor * right + evalTanhs(terms, right);

  if (yTarget >= rightY) return right;

  const ratio = (yTarget - leftY) / (rightY - leftY);

  return left * (1 - ratio) + right * ratio;
}

const VAR_CACHE: number[] = [VAR_INIT];

/** `get_var(times_ranked)` (ratings.py:73), memoised exactly as DMOJ does. */
export function getVar(timesRanked: number): number {
  while (timesRanked >= VAR_CACHE.length) {
    const previous = VAR_CACHE[VAR_CACHE.length - 1] as number;
    VAR_CACHE.push(1 / (1 / (previous + VAR_PER_CONTEST) + 1 / BETA2));
  }

  return VAR_CACHE[timesRanked] as number;
}

export interface RecalculatedRatings {
  readonly rating: number[];
  readonly mean: number[];
  readonly performance: number[];
}

/**
 * `recalculate_ratings(ranking, old_mean, times_ranked, historical_p, perf_ceiling)`
 * (ratings.py:80).
 *
 * @param ranking fractional ranks, ascending (best first), from `tieRanker`
 * @param oldMean each competitor's previous skill mean
 * @param timesRanked how many rated contests each competitor already has
 * @param historicalP each competitor's past performances, newest first
 * @param perfCeiling the contest's performance ceiling, or null
 */
export function recalculateRatings(
  ranking: readonly number[],
  oldMean: readonly number[],
  timesRanked: readonly number[],
  historicalP: readonly (readonly number[])[],
  perfCeiling: number | null | undefined,
): RecalculatedRatings {
  const n = ranking.length;
  let newP: number[] = new Array(n).fill(0);
  let newMean: number[] = new Array(n).fill(0);

  const updatedBounds: [number, number] = [VALID_RANGE[0], VALID_RANGE[1]];

  if (perfCeiling !== null && perfCeiling !== undefined) {
    updatedBounds[1] = Math.min(updatedBounds[1], perfCeiling);
  }

  // Pre-multiply delta by TANH_C, as DMOJ does, to save work in the inner loop.
  const delta = timesRanked.map((t) => TANH_C * Math.sqrt(getVar(t) + VAR_PER_CONTEST + BETA2));
  const pTanhTerms: TanhTerm[] = oldMean.map((mean, i) => [mean, delta[i] as number, 1]);

  const solveIdx = (i: number, bounds: readonly [number, number]): void => {
    const r = ranking[i] as number;
    let yTarget = 0;

    for (let j = 0; j < n; j++) {
      const s = ranking[j] as number;

      if (s > r) yTarget += 1 / (delta[j] as number);
      else if (s < r) yTarget -= 1 / (delta[j] as number);
      // A tie counts as half a win, as per Elo-MMR: it contributes nothing.
    }

    newP[i] = solve(pTanhTerms, yTarget, 0, bounds);
  };

  // Fill everything between i and j; new_p is non-increasing in the rank.
  const divconq = (i: number, j: number): void => {
    if (j - i > 1) {
      const k = Math.floor((i + j) / 2);
      solveIdx(k, [newP[j] as number, newP[i] as number]);
      divconq(i, k);
      divconq(k, j);
    }
  };

  if (n < 2) {
    newP = [...oldMean];
    newMean = [...oldMean];
  } else {
    solveIdx(0, updatedBounds);
    solveIdx(n - 1, updatedBounds);
    divconq(0, n - 1);

    for (let i = 0; i < n; i++) {
      const terms: TanhTerm[] = [];
      let wPrev = 1;
      let wSum = 0;
      const history = [newP[i] as number, ...(historicalP[i] ?? [])];

      for (let j = 0; j < history.length; j++) {
        const gamma2 = j > 0 ? VAR_PER_CONTEST : 0;
        const hVar = getVar((timesRanked[i] as number) + 1 - j);
        const k = hVar / (hVar + gamma2);
        const w = wPrev * k ** 2;
        terms.push([history[j] as number, Math.sqrt(BETA2) * TANH_C, w]);
        wPrev = w;
        wSum += w / BETA2;
      }

      const w0 = 1 / getVar((timesRanked[i] as number) + 1) - wSum;
      const p0 = evalTanhs(terms.slice(1), oldMean[i] as number) / w0 + (oldMean[i] as number);
      newMean[i] = solve(terms, w0 * p0, w0, updatedBounds);
    }
  }

  // The displayed rating lags the mean to reward participation; the gap closes
  // as times_ranked grows.
  const rating = newMean.map((m, i) =>
    Math.max(1, pythonRound(m - (Math.sqrt(getVar((timesRanked[i] as number) + 1)) - SD_LIM))),
  );

  return { rating, mean: newMean, performance: newP };
}

/** Python's one-argument `round`: half to even. */
function pythonRound(value: number): number {
  const floor = Math.floor(value);
  const diff = value - floor;

  if (diff > 0.5) return floor + 1;

  if (diff < 0.5) return floor;

  return floor % 2 === 0 ? floor : floor + 1;
}

/* -------------------------------------------------------------------------- */
/* Rating a contest                                                           */
/* -------------------------------------------------------------------------- */

export interface RatingInputRow {
  readonly participationId: Id;
  readonly profileId: Id;
  readonly score: number;
  readonly cumtime: number;
  readonly tiebreaker: number;
  readonly isDisqualified?: boolean;
  /** Only live participations are rated. */
  readonly virtual?: number;
  /** `Count('submission')`: participants with none are skipped unless `rateAll`. */
  readonly submissionCount?: number;
  /** Rating of the competitor's most recent rated contest. */
  readonly lastRating?: number | null;
  /** Skill mean of the competitor's most recent rated contest. */
  readonly lastMean?: number | null;
  /** How many rated contests the competitor already has. */
  readonly timesRated?: number;
}

export interface RateContestOptions {
  readonly contest?: Pick<
    ContestRow,
    "rateAll" | "ratingFloor" | "ratingCeiling" | "performanceCeilingOverride" | "rateExcludeProfileIds"
  >;
  /** Past performances per profile, newest rated contest first. */
  readonly priorHistory?: Readonly<Record<Id, readonly number[]>>;
  /** `last_rated` for the produced rows. */
  readonly now?: number;
}

export interface RatingOutputRow {
  readonly participationId: Id;
  readonly profileId: Id;
  /** The fractional rank Elo-MMR used, stored in `ratings.rank`. */
  readonly rank: number;
  readonly rating: number;
  readonly mean: number;
  readonly performance: number;
  readonly lastRated: number;
}

/** `Contest.performance_ceiling` (judge/models/contest.py:299). */
export function performanceCeiling(
  contest: Pick<ContestRow, "performanceCeilingOverride" | "ratingCeiling"> | undefined,
): number | null {
  if (!contest) return null;

  if (contest.performanceCeilingOverride !== null && contest.performanceCeilingOverride !== undefined) {
    return contest.performanceCeilingOverride;
  }

  if (contest.ratingCeiling) return contest.ratingCeiling + CONTEST_PERF_CEILING_INCREMENT;

  return null;
}

/**
 * `rate_contest(contest)` (ratings.py:147) without the database.
 *
 * Rows are filtered and ordered here exactly as the queryset does, and the
 * returned rows are what the caller should write to the `ratings` table (plus
 * `profiles.rating` for each competitor).
 */
export function rateContest(
  rows: readonly RatingInputRow[],
  options: RateContestOptions = {},
): RatingOutputRow[] {
  const contest = options.contest;
  const excluded = new Set(contest?.rateExcludeProfileIds ?? []);

  const eligible = rows.filter((row) => {
    if ((row.virtual ?? 0) !== 0) return false;

    if (excluded.has(row.profileId)) return false;

    if (!contest?.rateAll && !(row.submissionCount ?? 0)) return false;
    const lastRating = row.lastRating ?? RATING_INIT;

    if (contest?.ratingFloor !== null && contest?.ratingFloor !== undefined) {
      if (lastRating < contest.ratingFloor) return false;
    }

    if (contest?.ratingCeiling !== null && contest?.ratingCeiling !== undefined) {
      if (lastRating > contest.ratingCeiling) return false;
    }

    return true;
  });

  // order_by('is_disqualified', '-score', 'cumtime', 'tiebreaker')
  const sorted = [...eligible].sort((a, b) => {
    const dq = Number(a.isDisqualified ?? false) - Number(b.isDisqualified ?? false);

    if (dq !== 0) return dq;

    if (a.score !== b.score) return b.score - a.score;

    if (a.cumtime !== b.cumtime) return a.cumtime - b.cumtime;

    return a.tiebreaker - b.tiebreaker;
  });

  const ranking = tieRanker(sorted, (row) => [row.score, row.cumtime, row.tiebreaker]);
  const oldMean = sorted.map((row) => row.lastMean ?? MEAN_INIT);
  const timesRanked = sorted.map((row) => row.timesRated ?? 0);
  const historicalP = sorted.map((row) => options.priorHistory?.[row.profileId] ?? []);

  const { rating, mean, performance } = recalculateRatings(
    ranking,
    oldMean,
    timesRanked,
    historicalP,
    performanceCeiling(contest),
  );

  const lastRated = options.now ?? Date.now();

  return sorted.map((row, i) => ({
    participationId: row.participationId,
    profileId: row.profileId,
    rank: ranking[i] as number,
    rating: rating[i] as number,
    mean: mean[i] as number,
    performance: performance[i] as number,
    lastRated,
  }));
}

/* -------------------------------------------------------------------------- */
/* Rating levels                                                              */
/* -------------------------------------------------------------------------- */

export const RATING_LEVELS: readonly string[] = [
  "Newbie",
  "Amateur",
  "Expert",
  "Candidate Master",
  "Master",
  "Grandmaster",
  "Target",
];

export const RATING_VALUES: readonly number[] = [1000, 1300, 1600, 1900, 2400, 3000];

export const RATING_CLASS: readonly string[] = [
  "rate-newbie",
  "rate-amateur",
  "rate-expert",
  "rate-candidate-master",
  "rate-master",
  "rate-grandmaster",
  "rate-target",
];

/** Python's `bisect.bisect` (bisect_right). */
function bisectRight(values: readonly number[], target: number): number {
  let low = 0;
  let high = values.length;

  while (low < high) {
    const mid = (low + high) >>> 1;

    if (target < (values[mid] as number)) high = mid;
    else low = mid + 1;
  }

  return low;
}

/** `rating_level(rating)` (ratings.py:212). */
export function ratingLevel(rating: number): number {
  return bisectRight(RATING_VALUES, rating);
}

/** `rating_name(rating)`. */
export function ratingName(rating: number): string {
  return RATING_LEVELS[ratingLevel(rating)] as string;
}

/** `rating_class(rating)`. */
export function ratingClass(rating: number): string {
  return RATING_CLASS[ratingLevel(rating)] as string;
}

/** `rating_progress(rating)`: how far through the current band, in [0, 1]. */
export function ratingProgress(rating: number): number {
  const level = ratingLevel(rating);

  if (level === RATING_VALUES.length) return 1;
  const previous = level === 0 ? 0 : (RATING_VALUES[level - 1] as number);
  const next = RATING_VALUES[level] as number;

  return (rating - previous) / (next - previous);
}

/** `Profile.get_user_css_class(display_rank, rating, rating_colors)` (profile.py:320). */
export function getUserCssClass(
  displayRank: string | number,
  rating: number | null | undefined,
  ratingColors = true,
): string {
  if (!ratingColors) return String(displayRank);
  const cls = rating === null || rating === undefined ? "rate-none" : ratingClass(rating);

  return `rating ${cls} ${displayRank}`;
}
