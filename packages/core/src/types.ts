/**
 * Plain input rows for the domain logic.
 *
 * Nothing here imports Convex. Every function in this package takes plain
 * objects shaped like the Convex tables, so the same rules
 * can be exercised from tests, from Convex queries and from the web app.
 *
 * Ids are opaque strings. Timestamps are milliseconds since the epoch.
 * Durations are seconds unless the field name says otherwise.
 */

export type Id = string;

/** Milliseconds since the Unix epoch. */
export type Timestamp = number;

/**
 * A decoded JSON value, the way an untyped stored column arrives.
 *
 * `Contest.format_config` is free-form JSON that only the contest format
 * owning it can interpret, so it reaches this package undecoded; the format's
 * `validate`/`resolveConfig` pair turns it into that format's config type.
 */
export type JsonValue = boolean | number | string | null | readonly JsonValue[] | JsonObject;

export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export type SubmissionResult = "AC" | "WA" | "TLE" | "MLE" | "OLE" | "IR" | "RTE" | "CE" | "IE" | "SC" | "AB";

export type SubmissionStatus = "QU" | "P" | "G" | "D" | "IE" | "CE" | "AB";

/** Problem.submission_source_visibility_mode. */
export type SubmissionSourceVisibility = "A" | "S" | "O" | "F";

/** The site-wide DMOJ_SUBMISSION_SOURCE_VISIBILITY setting. */
export type GlobalSubmissionSourceVisibility = "all" | "all-solved" | "only-own";

/** Contest.scoreboard_visibility. */
/**
 * The fixed vocabulary for "who" on a contest or a problem:
 * - `staff`: the editors, and in on everything without being listed;
 * - `testers`, `spectators`: the People tab's lists;
 * - `contestants`: anyone who has joined the contest;
 * - `everyone`: anyone who can see the contest or the problem at all.
 */
export type Audience = "staff" | "testers" | "spectators" | "contestants" | "everyone";

/**
 * When a policy starts admitting its audiences: from the contest's start,
 * once the viewer's own window has ended, or once the contest has ended.
 */
export type Moment = "start" | "ownEnd" | "end";

/** Who may see something, and from when. Staff need no listing. */
export interface AudiencePolicy {
  readonly audiences: readonly Audience[];
  readonly from: Moment;
}

export type DisplayRank = "user" | "setter" | "admin" | (string & {});

/**
 * A contest's settings, each as one shape, so that a window of zero, a blind
 * over no freeze, a rating floor on an unrated contest or a join limit naming
 * nobody has no spelling at all.
 */

/** How the clock runs. `window` starts each competitor's clock, and their penalty time, when they join. */
export type ContestSchedule =
  | { readonly kind: "together" }
  | { readonly kind: "window"; readonly seconds: number };

/**
 * Who may enter. A restricted contest gates on the organisations and classes
 * it names, and on the people it names; `match` says whether somebody must
 * clear every gate that names anyone, or any one of them.
 */
export type ContestEntry =
  | { readonly kind: "open" }
  | {
      readonly kind: "restricted";
      readonly match: "all" | "any";
      readonly organizationIds: readonly Id[];
      readonly classIds: readonly Id[];
      readonly profileIds: readonly Id[];
    };

/** Which organisations may join, once entry is allowed. Absent means anyone who can enter. */
export interface ContestJoinLimit {
  readonly organizationIds: readonly Id[];
}

/** Absent means the board never freezes. */
export interface ContestFreeze {
  readonly minutes: number;
  /** Contestants see their own verdicts as pending, until the contest ends. */
  readonly blind: boolean;
}

/** Absent means unrated. */
export interface ContestRating {
  /** Rate competitors who submitted nothing too. */
  readonly everyone: boolean;
  readonly excludeProfileIds: readonly Id[];
  /** On the competitor's previous rating; a newcomer counts as 1200. */
  readonly floor?: number;
  readonly ceiling?: number;
  readonly performanceCeiling?: number;
}

export type ContestLabels =
  | { readonly kind: "letters" }
  | { readonly kind: "custom"; readonly labels: readonly string[] };

/**
 * A viewer. `null` (or `undefined`) is Django's `AnonymousUser`: every rule
 * that reads `user.is_authenticated` treats it as false.
 */
export interface ProfileRow {
  readonly id: Id;
  readonly username: string;
  readonly isStaff: boolean;
  readonly isSuperuser: boolean;
  /** DMOJ permission codenames, e.g. `judge.edit_all_problem`. */
  readonly permissions: readonly string[];
  /** Organizations this profile is a member of. */
  readonly organizationIds?: readonly Id[];
  /** Classes this profile is a member of. */
  readonly classIds?: readonly Id[];
  /** Organizations this profile administers (`Profile.admin_of`). */
  readonly adminOfOrganizationIds?: readonly Id[];
  /** Classes this profile administers (`Profile.class_admin_of`). */
  readonly adminOfClassIds?: readonly Id[];
  readonly isUnlisted?: boolean;
  readonly isBannedFromProblemVoting?: boolean;
  readonly mute?: boolean;
  /** Set while the profile is in contest mode. */
  readonly currentParticipationId?: Id | null;
  /** Contest of `currentParticipationId`, denormalised for the pure rules. */
  readonly currentContestId?: Id | null;
  readonly rating?: number | null;
  readonly displayRank?: DisplayRank;
  readonly points?: number;
  readonly performancePoints?: number;
  readonly problemCount?: number;
}

export type Viewer = ProfileRow | null | undefined;

export interface ProblemRow {
  readonly id: Id;
  readonly code: string;
  readonly name?: string;
  readonly isPublic: boolean;
  readonly isOrganizationPrivate: boolean;
  readonly organizationIds?: readonly Id[];
  readonly authorProfileIds?: readonly Id[];
  readonly curatorProfileIds?: readonly Id[];
  readonly testerProfileIds?: readonly Id[];
  readonly bannedProfileIds?: readonly Id[];
  readonly points?: number;
  readonly partial?: boolean;
  readonly submissionSourceVisibility?: SubmissionSourceVisibility;
}

export interface SolutionRow {
  readonly problemId: Id;
  readonly isPublic: boolean;
  /** `publish_on`, ms since epoch. */
  readonly publishOn: Timestamp;
  readonly authorProfileIds?: readonly Id[];
}

export interface OrganizationRow {
  readonly id: Id;
  readonly slug?: string;
  readonly name?: string;
  readonly adminProfileIds?: readonly Id[];
  readonly isOpen?: boolean;
  readonly classRequired?: boolean;
}

export interface ClassRow {
  readonly id: Id;
  readonly organizationId: Id;
  readonly isActive?: boolean;
  readonly adminProfileIds?: readonly Id[];
  readonly memberProfileIds?: readonly Id[];
}

export interface ContestRow {
  readonly id: Id;
  readonly key: string;
  readonly name?: string;
  readonly startTime: Timestamp;
  readonly endTime: Timestamp;
  readonly schedule: ContestSchedule;
  readonly isVisible: boolean;
  readonly entry: ContestEntry;
  readonly joinLimit?: ContestJoinLimit;
  readonly freeze?: ContestFreeze;
  readonly rating?: ContestRating;
  readonly labels: ContestLabels;
  readonly authorProfileIds?: readonly Id[];
  readonly curatorProfileIds?: readonly Id[];
  readonly testerProfileIds?: readonly Id[];
  readonly spectatorProfileIds?: readonly Id[];
  readonly testerSeeScoreboard?: boolean;
  readonly testerSeeSubmissions?: boolean;
  /** Spectators see the board while the policy hides it, like testers with the flag above. */
  readonly spectatorSeeScoreboard?: boolean;
  /** Spectators may open the problems before the contest starts, as testers always may. */
  readonly spectatorSeeProblemsEarly?: boolean;
  /** Admitted to the whole contest, whatever `entry` says, and to its scoreboard. */
  readonly alwaysAdmitProfileIds?: readonly Id[];
  readonly viewContestSubmissionsProfileIds?: readonly Id[];
  readonly bannedProfileIds?: readonly Id[];
  readonly accessCode?: string | null;
  /** Who sees the full board, and from when; the bypasses above come first. */
  readonly scoreboard: AudiencePolicy;
  readonly formatName?: string;
  readonly formatConfig?: JsonValue;
  readonly pointsPrecision?: number;
  readonly runPretestsOnly?: boolean;
  readonly lockedAfter?: Timestamp | null;
  /** Every problem in the contest is made public the moment it ends. */
  readonly publishProblemsAtEnd?: boolean;
  /** When that happened, once it has. */
  readonly problemsPublishedAt?: Timestamp;
}

/** `ContestParticipation.LIVE` */
export const PARTICIPATION_LIVE = 0;

/** `ContestParticipation.SPECTATE` */
export const PARTICIPATION_SPECTATE = -1;

export interface ContestParticipationRow {
  readonly id: Id;
  readonly contestId: Id;
  readonly profileId: Id;
  /** `real_start`, ms since epoch. */
  readonly realStart: Timestamp;
  readonly score?: number;
  readonly cumtime?: number;
  readonly tiebreaker?: number;
  readonly isDisqualified?: boolean;
  /** 0 live, -1 spectate, n > 0 the n-th virtual participation. */
  readonly virtual: number;
  readonly formatData?: FormatData | null;
}

export interface ContestProblemRow {
  readonly id: Id;
  readonly contestId: Id;
  readonly problemId: Id;
  readonly problemCode?: string;
  readonly points: number;
  readonly partial?: boolean;
  readonly isPretested?: boolean;
  readonly order: number;
  readonly maxSubmissions?: number | null;
}

/**
 * A submission as the contest formats and the scoreboard see it: the
 * `submissions` row joined with its `contestProblemId`/`contestPoints`
 * (DMOJ's `ContestSubmission`).
 */
export interface ContestSubmissionRow {
  readonly id: Id;
  readonly contestProblemId: Id;
  readonly participationId?: Id;
  /** `ContestSubmission.points`. */
  readonly contestPoints: number;
  readonly casePoints?: number;
  readonly caseTotal?: number;
  readonly result?: SubmissionResult | null;
  readonly status?: SubmissionStatus | null;
  /** Submission date, ms since epoch. */
  readonly date: Timestamp;
  readonly isPretest?: boolean;
  /** Per-case rows, needed by the `ioi16` format only. */
  readonly testCases?: readonly SubmissionTestCaseRow[];
}

export interface SubmissionTestCaseRow {
  readonly case: number;
  readonly status: SubmissionResult;
  readonly time?: number | null;
  readonly memory?: number | null;
  readonly points: number;
  readonly total: number;
  /** Batch number, or null/undefined for an unbatched case. */
  readonly batch?: number | null;
}

export interface SubmissionRow {
  readonly id: Id;
  readonly profileId: Id;
  readonly problemId: Id;
  readonly date: Timestamp;
  readonly status: SubmissionStatus;
  readonly result?: SubmissionResult | null;
  readonly points?: number | null;
  readonly casePoints: number;
  readonly caseTotal: number;
  readonly contestId?: Id | null;
  readonly contestProblemId?: Id | null;
  readonly participationId?: Id | null;
  readonly lockedAfter?: Timestamp | null;
  readonly isArchived?: boolean;
}

export interface BlogPostRow {
  readonly id: Id;
  readonly title?: string;
  readonly slug?: string;
  readonly visible: boolean;
  readonly publishOn: Timestamp;
  readonly authorProfileIds?: readonly Id[];
}

export type CommentTargetType = "problem" | "contest" | "blog" | "solution";

export interface CommentRow {
  readonly id: Id;
  readonly targetType: CommentTargetType;
  /** Problem code, contest key, blog id or solution problem code. */
  readonly targetKey: string;
  readonly authorProfileId: Id;
  readonly hidden?: boolean;
}

/** `ContestParticipation.format_data`: `{ [contestProblemId]: entry }`. */
export type FormatData = Record<string, FormatDataEntry>;

export interface FormatDataEntry {
  /** Seconds from the participation start. */
  time: number;
  points: number;
  /** Rejected submissions counted for a penalty (atcoder, icpc). */
  penalty?: number;
  /** Bonus points (ecoo). */
  bonus?: number;
  /** Submissions the judge ran on it, the solve included. */
  attempts?: number;
}
