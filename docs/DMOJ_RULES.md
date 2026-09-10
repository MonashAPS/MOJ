# DMOJ rules, extracted

Every rule `packages/core` implements, in prose, with the file and line it was taken from. Line numbers
refer to the DMOJ tree the port was made against (`judge/` in the upstream `DMOJ/online-judge` checkout)
and, for the freeze and the hall scoreboard, to `MonashAPS/online-judge` branch `v2`.

Read this alongside the code: each exported function in `packages/core/src` carries the same citation in
its doc comment, so a reviewer can put the Python and the TypeScript side by side.

Conventions used below:

- "viewer" is DMOJ's `user`; an anonymous viewer is `null` and every `user.is_authenticated` test is false
  for it.
- `hasPerm(viewer, code)` is Django's `user.has_perm`: false for anonymous users, true for everything when
  `is_superuser`.
- Ids are strings; DMOJ's many-to-many joins become id arrays on the row, and anything DMOJ answers with a
  separate query is passed in through an options object.

---

## 1. Permissions (`src/permissions.ts`)

### `hasPerm(viewer, code)` — Django `ModelBackend.has_perm`

An anonymous viewer has no permissions. A superuser has all of them, without consulting the permission
list. Otherwise the code must be in `profile.permissions`. Codes are matched fully qualified
(`judge.edit_all_problem`) or bare (`edit_all_problem`), because the DMOJ import carries
`auth_permission.codename` values while the site asks with the app label attached.

### `problemIsEditor(problem, profileId)` — `Problem.is_editor` (judge/models/problem.py:197)

True when the profile is an author or a curator. DMOJ's `editor_ids` (problem.py:348) is the union of
`author_ids` and the curators.

### `problemIsEditableBy(problem, viewer)` — `Problem.is_editable_by` (problem.py:199)

In order:

1. Anonymous: no.
2. Without `judge.edit_own_problem`: no. This gate comes first, so a user with `edit_all_problem` but not
   `edit_own_problem` cannot edit anything.
3. With `judge.edit_all_problem`, or with `judge.edit_public_problem` on a public problem: yes.
4. Author or curator: yes.
5. The problem is organization-private and the viewer administers one of its organizations: yes.
6. Otherwise no.

### `problemIsAccessibleBy(problem, viewer, options)` — `Problem.is_accessible_by` (problem.py:212)

The current-contest short circuit comes first: unless `skipContestProblemCheck` is set, an authenticated
viewer with `profile.current_contest_id` set who is in a contest containing this problem can see it, full
stop. The caller supplies that as `options.inCurrentContest`, because DMOJ answers it with
`ContestProblem.objects.filter(problem_id=self.id, contest__users__id=current).exists()`.

Then:

1. If the problem is public: not organization-private, yes; with `judge.see_organization_problem`, yes; a
   member of one of its organizations, yes.
2. Anonymous viewers stop here with no.
3. `judge.see_private_problem`: yes.
4. Editable by the viewer, or the viewer is an author or curator: yes.
5. A tester: yes.
6. Otherwise no.

### `problemIsSubsManageableBy(problem, viewer)` — `Problem.is_subs_manageable_by` (problem.py:255)

`user.is_staff` **and** `judge.rejudge_submission` **and** `is_editable_by`. Note `is_staff` is a plain
flag: a superuser without it fails this check, and DMOJ's own fixtures make the superuser staff.

### `problemIsVisibleTo(problem, viewer)` — `Problem.get_visible_problems` (problem.py:259)

The queryset, as a predicate. It must agree with `is_accessible_by` for every problem and viewer; DMOJ
asserts that in `test_problem.py:test_problems_list` and so does
`tests/permissions.problem.test.ts`.

- Anonymous: `get_public_problems()` (problem.py:316), i.e. public and not organization-private.
- With `judge.see_private_problem`, or with both `edit_own_problem` and `edit_all_problem`: everything.
- Otherwise start from `is_public`; unless the viewer has `see_organization_problem` or (`edit_own_problem`
  and `edit_public_problem`), also require the problem to be non-organization-private or to share an
  organization with the viewer. With `edit_own_problem`, additionally allow organization-private problems
  whose organization the viewer administers. Finally, authors, curators and testers always pass
  (`q_add_author_curator_tester`, problem.py:301).

### `problemIsInEditableSet(problem, viewer)` — `Problem.get_editable_problems` (problem.py:320)

`edit_own_problem` is required; `edit_all_problem` returns everything; otherwise authors and curators,
organization-private problems the viewer administers, and, with `edit_public_problem`, all public problems.

### `votePermissionForUser(problem, viewer, options)` — `Problem.vote_permission_for_user` (problem.py:470)

`NONE` for anonymous viewers and for anyone in contest mode. `VIEW` for unlisted users, users banned from
problem voting, users banned from this problem, and users who have not fully solved it. `VOTE` otherwise.
`voteCanView`/`voteCanVote` reproduce `VotePermission.can_view`/`can_vote` (problem.py:100).

DMOJ's ban check reads `self.banned_users.filter(pk=user.pk)`, comparing a `Profile` primary key against a
`User` primary key. That works on DMOJ's data only because the two tables were populated in step. The port
compares profile ids, which is what the check was meant to do.

`options.hasSolvedProblem` is `Problem.is_solved_by` (problem.py:467): a non-archived submission with
`result='AC'` and `case_points >= case_total`.

### `solutionIsAccessibleBy(solution, problem, viewer, now)` — `Solution.is_accessible_by` (problem.py:568)

Public and already published (strictly `publish_on < now`), or `judge.see_private_solution`, or the problem
is editable by the viewer. The solution's own authors are not consulted.

### `contestShowScoreboard(contest, now)` — `Contest.show_scoreboard` (judge/models/contest.py:263)

False before the contest starts. False while a `C` (hidden for the duration of the contest) or `P` (hidden
for the duration of participation) contest is still running. Otherwise true unless the visibility is `H`.

### `contestCanSeeFullScoreboard(contest, viewer, ctx)` — `Contest.can_see_full_scoreboard` (contest.py:236)

1. `show_scoreboard`: yes (this is why anonymous viewers "can see the full scoreboard" of a running public
   contest in DMOJ's own test matrices).
2. Anonymous viewers stop here.
3. `judge.see_private_contest` or `judge.edit_all_contest`: yes.
4. Author or curator: yes.
5. Tester, when `tester_see_scoreboard`: yes.
6. Spectator, once the contest has started: yes.
7. Listed in `view_contest_scoreboard`: yes.
8. Visibility `P` and the viewer has completed the contest: yes.

### `contestCanSeeOwnScoreboard(contest, viewer, ctx)` — `Contest.can_see_own_scoreboard` (contest.py:227)

Full scoreboard access implies own-scoreboard access. Otherwise: no before the start; no when the
scoreboard is hidden and the viewer is neither in the contest nor finished with it; yes otherwise.

### `contestHasCompletedContest(contest, viewer, ctx)` — `Contest.has_completed_contest` (contest.py:255)

The viewer has a live (`virtual = 0`) participation in this contest whose window has closed. The
participation is passed in as `ctx.liveParticipation`.

### `contestIsInContest(contest, viewer)` — `Contest.is_in_contest` (contest.py:221)

The viewer's `current_contest` participation belongs to this contest.

### `contestAccessCheck(contest, viewer)` — `Contest.access_check` (contest.py:346)

DMOJ raises `Contest.Inaccessible` or `Contest.PrivateContest`; the port returns
`{kind: 'ok'} | {kind: 'inaccessible'} | {kind: 'privateContest', organizationIds}`.

For anonymous viewers: invisible contests are inaccessible; private or organization-private ones are
private; everything else is fine.

For authenticated viewers, in order: `see_private_contest` or `edit_all_contest`; author or curator;
tester; spectator — any of these pass. Then an invisible contest is inaccessible. A contest that is neither
private nor organization-private is fine. Being listed in `view_contest_scoreboard` passes. Otherwise:
organization-private only needs organization (or class) membership; private-to-users only needs to be in
`private_contestants`; a contest that is both needs **both**.

### `contestIsEditableBy(contest, viewer)` — `Contest.is_editable_by` (contest.py:449)

`judge.edit_all_contest`, or `judge.edit_own_contest` plus being an author or curator.

### `contestIsLiveJoinableBy(contest, viewer, ctx)` — `Contest.is_live_joinable_by` (contest.py:403)

Assumes access has already been checked. No before the start; no for anonymous viewers; no for editors and
testers (they would pollute the standings); no once the viewer has completed the contest. With
`limit_join_organizations`, the viewer must be in one of `join_organizations`. Note this rule never looks
at whether the contest has *ended*, so a finished contest still reports as live-joinable; the join view
handles that separately.

### `contestIsSpectatableBy(contest, viewer)` — `Contest.is_spectatable_by` (contest.py:430)

No for anonymous viewers. Editors and testers always yes. Otherwise the `limit_join_organizations` check.

### `contestIsVisibleTo(contest, viewer)` — `Contest.get_visible_contests` (contest.py:461)

The queryset as a predicate, and it must agree with `is_accessible_by`; DMOJ asserts that in
`test_contest.py:test_contests_list`.

- Anonymous: visible, not private, not organization-private.
- `see_private_contest` or `edit_all_contest`: everything.
- Otherwise: visible **and** (listed in `view_contest_scoreboard`; or neither private flag; or private-only
  and listed as a private contestant; or organization-private-only and in an organization or class; or both
  flags and both conditions). Authors, curators, testers and spectators pass regardless.

### `canSeeSubmissionDetail(submission, viewer, ctx)` — `Submission.can_see_detail` (judge/models/submission.py:147)

Anonymous: no. Then seven paths, in DMOJ's order:

1. The problem is editable by the viewer.
2. `judge.view_all_submission`.
3. The submission is the viewer's own.
4. Source visibility `A` (always visible).
5. Source visibility `S` (visible once solved): the problem must be public or the viewer a tester, **and**
   the viewer must have fully solved it.
6. Source visibility `O` (only own): testers of the problem still see everything.
7. The submission was made in a contest and the viewer is an author or curator of it, is listed in
   `view_contest_submissions`, or is a tester while `tester_see_submissions` is on.

`resolveSubmissionSourceVisibility` implements `Problem.submission_source_visibility` (problem.py:390):
mode `F` follows the site setting `DMOJ_SUBMISSION_SOURCE_VISIBILITY`, whose default is `all-solved`, i.e.
`S` (dmoj/settings.py:84).

### `blogPostCanSee` / `blogPostIsEditableBy` — `BlogPost` (judge/models/interface.py:275, :280)

Editable by anyone with `judge.edit_all_post`, or by an author who also has `judge.change_blogpost`.
Visible when the post is visible and `publish_on <= now` (note `<=`, where solutions use `<`), or when it
is editable by the viewer.

### `commentIsAccessibleBy(target, viewer, options)` — `Comment.is_accessible_by` (judge/models/comment.py:136)

A comment inherits the accessibility of the page it hangs off: `p:` a problem, `s:` a solution, `c:` a
contest, `b:` a blog post, anything else is accessible. A missing page (Django's `ObjectDoesNotExist`)
makes the comment inaccessible, which the port models by passing `null` for the target.

For `s:` pages, `is_accessible_by` checks the *solution* only. `Comment.most_recent` (comment.py:56) is
stricter, requiring problem access as well; the port follows `is_accessible_by`, and a caller that wants
the recent-comments behaviour should check problem access itself.

### Organizations — `judge/models/profile.py` and `judge/views/organization.py`

- `organizationIsAdmin` / `organizationCanEdit`: `OrganizationMixin.can_edit_organization`
  (views/organization.py:59) is authenticated plus membership of `organization.admins`.
- `organizationIsEditableBy`: the admin-site rule (admin/organization.py:98): `judge.change_organization`
  plus either `judge.edit_all_organization` or being an admin of that organization.
- `organizationCanReviewAllRequests`: `Organization.can_review_all_requests` (profile.py:86).
- `organizationCanReviewClassRequests`: `Organization.can_review_class_requests` (profile.py:89), i.e. the
  viewer administers one of the organization's classes.
- `canViewOrganizationRequest`: `OrganizationRequestDetail.get_object` (views/organization.py:250): the
  requester, an organization admin, or an admin of the requested class.
- `classIsVisibleTo`: `Class.get_visible_classes` (profile.py:118).

---

## 2. Contest formats (`src/formats/`)

All six formats write four fields: `score`, `cumtime` (seconds), `tiebreaker` and `formatData` (a map from
contest problem id to a per-problem entry). `score` is always `round(points, contest.points_precision)`
with Python's round-half-to-even; see section 7.

`updateParticipation` in `src/formats/index.ts` also applies `ContestParticipation.recompute_results`
(contest.py:529): a disqualified participation is forced to `score = -9999, cumtime = 0, tiebreaker = 0`.

### `default` (judge/contest_format/default.py:28)

Per contest problem: `points = MAX(contest submission points)` and `time = MAX(submission date)`. Note the
time is the *latest* submission on the problem, not the time of the best one. `cumtime` sums those times
over problems with a non-zero score, floored at 0. `tiebreaker` is always 0. `validate` accepts only
`None` or `{}` (default.py:21).

### `ioi` — legacy IOI (legacy_ioi.py:43)

Per contest problem: `points = MAX(points)` and, among the submissions that reached that maximum,
`time = MIN(date)` — the *first* time the best score was reached. With `cumtime` off (the default) every
recorded time is 0 and ties are not broken; with it on, times of scoring problems are summed into
`cumtime`. Config: `{cumtime: bool}` (legacy_ioi.py:19).

### `ioi16` — IOI 2016 onwards (ioi.py:17)

Scores per subtask. The SQL groups the participation's test cases by `(contest problem, batch, submission)`
and takes `MIN(points)` within each group, then takes the `MAX` of that per `(contest problem, batch)`, then
the `MIN(date)` among the submissions that reached it. In Python the problem's points are the sum of those
best batch scores, and the problem's time is the `MAX` of the batch times.

Two consequences of the SQL that the port keeps:

- Only submissions with `status = 'D'` count. The query left-joins `judge_submission` on `status='D'` and
  then inner-joins the test cases, so anything still grading contributes nothing.
- Unbatched cases have `batch IS NULL` and therefore collapse into a single pseudo-batch whose score is the
  **minimum** over every case in the submission. On a problem with no batches at all, that means the
  submission scores its worst case. This is DMOJ's behaviour, not a port bug.

### `atcoder` (atcoder.py:47)

Per contest problem: `points = MAX(points)`, `time = MIN(date)` among submissions with that score.
`cumtime` is the **maximum** solve time over solved problems (not the sum), plus `penalty` minutes for
every rejected submission that preceded the first maximum. `tiebreaker` is 0. Config: `{penalty: int >= 0}`,
default 5 (atcoder.py:20).

### `icpc` (icpc.py:47)

The same query, then: `cumtime` is the **sum** of solve times over solved problems plus `penalty` minutes
per earlier rejected submission; `tiebreaker` is the last solve time (sorted ascending). Config:
`{penalty: int >= 0}`, default 20 (icpc.py:20). Labels are letters (icpc.py:118).

Penalty counting, shared by `atcoder` and `icpc`: candidate submissions are the participation's submissions
on that problem **excluding** those whose result is null and those whose result is `IE` or `CE`. If the
problem scored, `prev = (submissions dated at or before the best time) - 1`; if it did not, `prev` is the
whole count, so an unsolved problem still displays how many tries it took. When the configured penalty is
0, `prev` is 0.

DMOJ does **not** exclude aborted (`AB`) submissions here. The hall scoreboard does; see section 5.

### `ecoo` (ecoo.py:49)

Only submissions whose result is not `IE` or `CE` count (a null result still counts, unlike the penalty
rule above). Per contest problem: take the **latest** such submission's date, and `MAX(points)` among the
submissions at that date. Bonuses, when the score is above zero:

- `first_ac_bonus` (default 10) if this was the participation's only counted submission on the problem and
  it scored the contest problem's full value.
- `time_bonus` (default 5): one point per whole `time_bonus` minutes remaining in the participation window
  at the moment of that submission, i.e. `floor(floor((participation.end_time - date) / 60) / time_bonus)`.

`score` is the sum of points and bonuses. `cumtime` is the sum of the recorded times when `cumtime` is on,
otherwise 0. `tiebreaker` is 0.

### `bestSolutionState(points, total)` (base.py:104)

`failed-score` for a falsy score, `full-score` when it equals the problem's points, `partial-score`
otherwise. The cell class is that string with a `pretest-` prefix when the contest is running pretests only
and the contest problem is pretested (default.py:48).

### `getLabelForProblem`

DMOJ evaluates a sandboxed Lua function stored on the contest (`Contest.get_label_for_problem`,
contest.py:196), falling back to the format's own: `default` numbers problems from 1 (default.py:75),
`icpc` letters them A, B, ... Z, AA, AB (icpc.py:118). MOJ replaces the Lua with `contests.labelScheme`
(`letters`, `numbers`, `custom`) plus `customLabels`; with no scheme set, the format's default applies. A
custom list shorter than the problem set falls back to letters past its end.

### `getShortFormDisplay`

The markdown lines each format yields to describe its settings, ported verbatim (default.py:78,
legacy_ioi.py:96, ioi.py:95, atcoder.py:116, icpc.py:126, ecoo.py:129).

---

## 3. Ratings (`src/ratings.ts`)

Elo-MMR, ported from judge/ratings.py.

- Constants (ratings.py:12): `BETA2 = 328.33²`, `RATING_INIT = 1200`, `MEAN_INIT = 1500`,
  `VAR_INIT = 350² · BETA2 / 212²`, `VALID_RANGE = MEAN_INIT ± 20·SD_INIT`,
  `VAR_PER_CONTEST = 1219.047619 · BETA2 / 212²`,
  `VAR_LIM = (sqrt(VAR_PER_CONTEST² + 4·BETA2·VAR_PER_CONTEST) - VAR_PER_CONTEST) / 2`,
  `TANH_C = sqrt(3)/π`.
- `tieRanker` (ratings.py:24): over an already-sorted sequence, a run of `k` tied competitors all receive
  the midpoint rank of the span they cover, so three-way ties at the top produce 2, 2, 2 and the next
  competitor gets 4.
- `evalTanhs` (ratings.py:44): `Σ (w/sd)·tanh((x-µ)/(2·sd))`.
- `solve` (ratings.py:48): bisect until the bracket is 2 wide, then linearly interpolate between the last
  bracketing values; clamp to the bounds when the target lies outside them.
- `getVar` (ratings.py:73): a memoised sequence, `var[0] = VAR_INIT` and
  `var[n+1] = 1 / (1/(var[n] + VAR_PER_CONTEST) + 1/BETA2)`.
- `recalculateRatings` (ratings.py:80): performance is solved for the best and worst competitor first, then
  filled in by divide and conquer using the fact that performance is non-increasing in rank; ties
  contribute nothing to the target sum (they count as half a win). Skill means are then solved against each
  competitor's performance history with geometric weights. The displayed rating is
  `max(1, round(mean - (sqrt(getVar(t+1)) - SD_LIM)))`, with Python's round-half-to-even. A field of fewer
  than two competitors keeps its means unchanged.
- `rateContest` (ratings.py:147) without the database: virtual participations, `rate_exclude` users and
  (unless `rate_all`) competitors with no submissions are dropped; the rating floor and ceiling apply to
  the competitor's *previous* rating, treating a newcomer as `RATING_INIT`. Rows are ordered by
  `(is_disqualified, -score, cumtime, tiebreaker)` and the rank passed to Elo-MMR is the fractional one.
- `performanceCeiling` (contest.py:299): the override if set, else `rating_ceiling + 400`
  (`DMOJ_CONTEST_PERF_CEILING_INCREMENT`, dmoj/settings.py:98), else none.
- `ratingLevel`/`ratingName`/`ratingClass`/`ratingProgress` (ratings.py:198-230) use
  `bisect_right([1000, 1300, 1600, 1900, 2400, 3000], rating)`, so a rating of exactly 1300 is Expert and
  exactly 2400 is Grandmaster.
- `getUserCssClass` (profile.py:321): `rating <class> <display rank>`, or just the display rank when rating
  colours are off.

---

## 4. Points and statistics (`src/points.ts`)

### `calculateProfilePoints` — `Profile.calculate_points` (judge/models/profile.py:242)

Over the user's non-archived submissions to public, non-organization-private problems:

- `points` is the sum of the best `Submission.points` per problem, counting only problems whose best score
  is above zero.
- `problemCount` counts distinct problems with a full solve (`result='AC'` and
  `case_points >= case_total`).
- `performancePoints` is `Σ PP_STEP^i · scores[i]` over the hundred highest scores, descending, plus
  `300 · (1 - 0.997^problemCount)`.

`DMOJ_PP_STEP = 0.95`, `DMOJ_PP_ENTRIES = 100`, `DMOJ_PP_BONUS_FUNCTION = 300·(1-0.997ⁿ)`
(dmoj/settings.py:47).

### `computeProblemStats` — `Problem.update_stats` (problem.py:396)

Over submissions from listed users that are not archived: `userCount` is the number of distinct users with
a full solve, `acRate` is `100 · full solves / all counted submissions`, and 0 when there are none.

### `ranker` — judge/utils/ranker.py:4

Standard competition ranking over a sorted sequence: equal keys share a rank and the next distinct key
skips by the size of the tie (1, 1, 3). The `rank` argument is the rank *before* the first item, so the
default 0 makes the first item rank 1.

---

## 5. Judging (`src/judging.ts`)

### `decodeCaseStatus` — `on_test_case` (judge/bridge/judge_handler.py:512)

The bitmask is tested in this order, and the order decides which flag wins on a case that sets several:
`4 TLE`, `8 MLE`, `64 OLE`, `2 RTE`, `16 IR`, `1 WA`, `32 SC`, else `AC`.

### `computeGradingEnd` — `on_grading_end` (judge_handler.py:351)

- `time` is the sum of case times; `memory` is the maximum case memory.
- Unbatched cases add their points and totals directly. DMOJ tests `if not case.batch`, so batch 0 counts
  as unbatched.
- Batched cases collapse to `min(points)` and `max(total)` per batch, then are added.
- `case_points` and `case_total` are rounded to one decimal.
- The result is the worst case status by index in `['SC', 'AC', 'WA', 'MLE', 'TLE', 'IR', 'RTE', 'OLE']`,
  so `SC` is mildest and `OLE` worst. A submission with no cases at all reports `SC`.
- The awarded points are `round(case_points / case_total · problem.points, 3)`, or 0 when the total is 0,
  and are zeroed entirely when the problem is not partial and the score is not exactly the problem's
  points.
- The status becomes `D`.

After that DMOJ recomputes the user's points (only for public, non-organization-private problems), the
problem statistics and the contest participation, and clears the judge's current submission.

### `computeContestSubmissionPoints` — `Submission.update_contest` (judge/models/submission.py:179)

`round(case_points / case_total · contest_problem.points, 3)`, zero when the total is 0, and zeroed when
the contest problem is not partial and the score is not exactly its points.

### Priorities — judge/judge_priority.py

`0` contest submission, `1` default, `2` rejudge, `3` batch rejudge; `JudgeList.priorities` is 4.
`judge_submission` (judge/judgeapi.py:53) picks batch rejudge over rejudge over the contest/default choice.

### Claiming — `JudgeList` (judge/bridge/judge_list.py) and `JudgeHandler.can_judge` (judge_handler.py:181)

- `can_judge`: the judge must have the problem's data and the executor, and either the submission has no
  judge pin and the judge is not disabled, or the pin names this judge. A pinned submission therefore
  reaches a disabled judge.
- `minimumOnlineTier` (`_update_min_tier`, judge_list.py:58): the lowest tier among online, enabled judges.
  A judge above that tier never claims (`_handle_free_judge`, judge_list.py:30).
- `shouldReserveJudge` (judge_list.py:85): with more than one judge in the tier and at most one of them
  free, keep it free. While that holds, the queue walk stops at the first entry of rejudge priority or
  worse rather than skipping past it, which matches both `_handle_free_judge`'s priority-marker walk and
  the `len(candidates) > 1 and len(available) == 1 and priority >= REJUDGE_PRIORITY` guard in
  `JudgeList.judge` (judge_list.py:165).
- The queue is ordered by priority ascending then date ascending; only `QU` submissions are claimable.

---

## 6. Freeze and the hall scoreboard (`src/scoreboard.ts`)

Ported from the MAPS fork: `judge/utils/frozen_scoreboard.py`, `judge/views/live_scoreboard.py` and the
reveal logic in `templates/contest/live-scoreboard.html`. The board is always scored ICPC-style regardless
of the contest's configured format.

### Cell states — frozen_scoreboard.py:41

`solved` (accepted before the freeze), `frozen` (something was submitted at or after the freeze, so an
answer is being withheld), `judging` (outstanding only because the judge has not caught up — nothing is
being withheld), `failed` (attempted, no accept, nothing outstanding), `empty` (never attempted).

`frozen` and `judging` are deliberately distinct: only `frozen` is a spoiler, only `frozen` is resolved by
the reveal, and only `frozen` drives the board's "frozen" badge.

### Verdict classification — frozen_scoreboard.py:55

`IGNORED_RESULTS = {IE, CE, AB}`: these never count as attempts. This differs from
`judge/contest_format/icpc.py`, which ignores only `IE` and `CE`; the fork adds `AB` because an aborted run
is not the competitor's fault.

`PENDING_RESULTS = {None, '', 'D'} ∪ {QU, P, G}`: an unjudged submission has a null result, but a grading
status can leak into the field, and `D` means graded-but-not-scored.

An attempt is accepted when it is not pending and either its result is `AC` or it scored the contest
problem's full points (so formats that award full marks without an `AC` still register).

### Cell computation — `_build_cell` (frozen_scoreboard.py:132)

Attempts are sorted by time. The public view resolves only attempts strictly before the freeze offset: the
first accept wins and stops the walk, earlier non-ignored attempts count as wrong (or pending). If it
solved, the cell is `solved` with `penalty = floor(solveTime / 60) + wrong · penaltyMinutes`. Otherwise, if
anything landed at or after the freeze the cell is `frozen`, else if anything is pending it is `judging`,
else if anything was wrong it is `failed`, else `empty`. Only for admins (`include_reveal`) does a frozen
cell also carry the resolution behind it.

### Rows and ranking — `build_scoreboard` (frozen_scoreboard.py:174), `rank_rows` (:247)

A row's `solved` counts `solved` cells and its `penalty` sums their penalties. Rows sort by solves
descending, penalty ascending, then username, and ties on `(solved, penalty)` share a rank.

### First blood — `firstSolves` in live-scoreboard.html

Per problem column, the earliest `solved` cell time. Recomputed on every render, so it stays correct as the
reveal turns frozen cells green.

### Event feed — `classify_event` (frozen_scoreboard.py:219)

Anything at or after the freeze reads as `pending` with `masked = true`, for everyone including admins; a
genuinely unjudged submission reads as `pending` with `masked = false`; otherwise `correct` or `incorrect`.
The real verdict is never shipped alongside a pending entry.

### Reveal — live-scoreboard.html

The target is the lowest-ranked row that still has a frozen cell, and its leftmost frozen cell. A step
replaces the cell with its revealed truth (or fails it closed when no truth was shipped), zeroes its
pending count, rescores the row and re-ranks the board, pushing a snapshot for undo. `revealAll` applies
every remaining step as one undoable action.

### Freeze offset and penalty — live_scoreboard.py:413

`freeze_offset = max(0, duration - freezeMinutes · 60)` in seconds from the contest start, or
`duration + 1` (past the end) when there is no freeze. The penalty comes from the contest format's own
config when it has one, defaulting to 20 minutes (`_penalty_minutes`, live_scoreboard.py:320).

`can_reveal` (live_scoreboard.py:307): superusers always; otherwise the viewer must be able to edit every
contest in the event, so a division organiser cannot spoil the other one.

### `applyFreeze` and `blindDuringFreeze` (SPEC section 7)

These two are MOJ's, built on the fork's rules:

- `applyFreeze` rescores the ordinary contest ranking from submissions made strictly before the freeze
  point, so a post-freeze solve cannot move anyone. Contest editors, users listed in
  `viewContestScoreboardProfileIds`, and anyone with `see_private_contest` or `edit_all_contest` see the
  real standings. Virtual participations are never frozen. The board stays frozen after the contest ends
  until staff reveal it, which the caller signals with `revealed: true`.
- `blindDuringFreeze` masks a contestant's own post-freeze submissions as pending until the contest ends,
  when `contests.blindDuringFreeze` is set. Staff are never masked, and other people's submissions are left
  to the freeze itself.

---

## 7. Numbers (`src/util/number.ts`)

DMOJ's arithmetic runs on Python and Django, whose rounding differs from JavaScript's in two ways that
matter for scores.

- `pyRound(value, digits)` is CPython's `round`: round-half-to-**even** applied to the *exact* binary value
  of the double, then converted back to the nearest double. `round(2.5) == 2`, and `round(2.675, 2) ==
  2.67` because 2.675 is really 2.67499999999999982. It is used for `score`, `case_points`, `case_total`
  and awarded points.
- `floatformat(value, arg)` is Django's filter: a positive `arg` always shows that many decimals, a
  negative one shows up to `-arg` decimals but nothing at all when the value is integral, and rounding is
  half **up** on the shortest decimal representation (`Decimal(repr(x)).quantize(exp, ROUND_HALF_UP)`), so
  `floatformat(2.675, -2) == "2.68"`. It is display-only.
- `niceRepr(seconds)` is `judge/utils/timedelta.py:nice_repr(delta, 'noday')`: `HH:MM:SS` with whole days
  folded into the hours.

---

## 8. Contest and participation clocks (`src/contestTiming.ts`)

- `participationStart` (contest.py:561): live and spectating participations of a contest with no time limit
  start when the contest does; everything else starts at `real_start`.
- `participationEndTime` (contest.py:566): spectators follow the contest end; a virtual participation gets
  `real_start + time_limit`, or `real_start + (end - start)` when the contest is untimed; a live
  participation gets the contest end, or `min(real_start + time_limit, contest end)`. A zero time limit is
  falsy in Python and is treated as no limit.
- `participationHasEnded` (contest.py:584) is `end_time < now`; `participationTimeRemaining`
  (contest.py:588) returns nothing once the window has closed.
- `contestStarted` (contest.py:281) is `start_time <= now`; `contestEnded` (contest.py:308) is
  `end_time < now`; `contestTimeBeforeStart`/`contestTimeBeforeEnd` (contest.py:285, :292) return null once
  the moment has passed.
- `contestJoinDecision` is `ContestJoin.join_contest` (judge/views/contests.py:384) as a pure decision:
  login required; refuse before the start unless the viewer is an editor or tester; refuse a banned user
  unless they are a superuser; after the contest ends create the next virtual participation; otherwise join
  live if live-joinable, else spectate if spectatable, else refuse. An access code is demanded only when a
  *new* participation would be created, and never for someone who can edit the contest; a live
  participation whose window has closed drops the user into spectating.
- `shouldLeaveContest` is `Profile.update_contest` (profile.py:294): contest mode drops when the
  participation window closes or the contest stops being accessible.

---

## 9. Verdicts (`src/verdicts.ts`)

Result codes and their names come from `SUBMISSION_RESULT` (submission.py:21) and
`Submission.USER_DISPLAY_CODES` (submission.py:49). `resultClassFromCode` (submission.py:94) maps a full
`AC` to `AC` and a partial one to `_AC`; `resultClass` (submission.py:102) reports `IE` or `CE` from the
status first. `shortStatus` is the result if there is one, else the status. `isGraded` (submission.py:195)
is any status outside `('QU', 'P', 'G')`. `isLocked` (submission.py:121) is `locked_after < now`.

Colour classes follow resources/status.scss, mapped onto the token names in SPEC section 9: `AC` green,
`_AC` partial, `WA` red, `TLE`/`MLE`/`CE`/`AB`/`SC` grey, `OLE`/`IR`/`RTE` amber, `IE` red, queued and
grading neutral.
