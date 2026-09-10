# Spec changes

Append dated bullets when you had to extend or deviate from docs/SPEC.md.

## 2026-09-10, foundation

- Convex's backing Postgres database is named `moj_dev`, not `convex` as section 14 says. The backend derives the
  name from `INSTANCE_NAME` (dashes become underscores) and will not accept another. `moj_auth` is unchanged.
- `contests` gained `revealedUntilRank?` and `isUnfrozen?`. Section 7's reveal ceremony is stepwise and undoable,
  which needs state on the contest; there was nowhere to put it.
- `siteSettings` is a single document with an explicit field list (site name, per-page counts, rating ratios,
  `requireStaffTwoFactor`, `pdfEnabled`, `mossApiKey`, `analytics`). Section 4 named the table but not its fields.
- Extra indexes beyond the ones section 4 lists, all additive: `problems.by_group`, `judges.by_online_tier`,
  `organizationRequests.by_organization_state`, `blogPosts.by_visible_publishOn`, `commentVotes.by_voter_comment`,
  `problemPointsVotes.by_voter_problem`, `problemTranslations.by_problem_language`, `jobs.by_status_createdAt`,
  `jobs.by_type_createdAt`, `uploads.by_cacheKey`, `pdfCache.by_problem_language`.
- Search indexes added for the command palette in section 20: `contests.search_name` and
  `organizations.search_name`. Section 4 only specified them on `profiles` and `problems`.
- `requirePerm` takes the context first, `requirePerm(ctx, code)`, like the other helpers in `convex/lib/auth.ts`.
- `convex/lib/auth.ts` carries its own `hasPerm`/`isStaff` for now. Section 5 says permission checks go through
  `packages/core`, which is another agent's workspace and does not exist on this branch. Replace the two functions
  with the `packages/core` imports at integration; nothing else in the file changes.
- `convex/maintenance.ts` holds the four no-op cron targets from section 12. `crons.ts` may only default-export the
  cron table, so the stub mutations needed a module and section 5 does not name one.
- The foundation branch also carries thin versions of `contests.ts` (`navBar`, `homeSidebar`), `blog.ts` (`list`),
  `comments.ts` (`recent`), `problems.ts` (`recent`), `rankings.ts` (`topUsers`), `languages.ts` (`list`, `byKey`)
  and `site.openOrganizations`, because the shell, the home page and the registration form need them. Each file
  says so at the top. The owning agent should merge their module over the top rather than replacing the file.
- Better Auth's `user` table gained `isStaff`, `isSuperuser`, `timezone`, `preferredLanguage` and
  `organizationSlugs` as additional fields. `isStaff` is in the JWT payload as section 13 requires; the other three
  carry the registration form's answers until the Convex profile is created.
- The Convex profile is created on the first authenticated page load, not during registration.
  `requireEmailVerification` means sign-up returns no session, so nothing can write to Convex as that user yet.
  `profiles.ensureProfile` (public, uses the caller's identity) is invoked by `ProfileBootstrap` in the shell;
  `profiles.ensureProfileForUser` (internal, explicit `userId`) is what `npm run setup` calls for the dev admin.
- `AUTH_JWKS_URL` may hold a `data:` URI containing the key set instead of a URL. Convex supports both, and the
  URL form needs the backend container to reach the web app on the host, which a host firewall can block. Setup
  probes for this and picks the form that works. See docs/RUNBOOK.md.
- The dev superuser's password is written straight into the Better Auth account row, because `admin` is shorter
  than `minPasswordLength` and only the sign-up endpoint enforces that.
- Staff without 2FA are redirected to `/accounts/2fa/` from everywhere except the account pages and
  `/edit/profile/`. DMOJ's middleware does not gate this at all (`DMOJ_REQUIRE_STAFF_2FA` only stops staff
  *disabling* their last factor) but a gate was asked for; `/edit/profile/` stays reachable because that is where
  DMOJ surfaces the requirement, and where enrolment will live.
- The web app runs with `trailingSlash: true` and `skipTrailingSlashRedirect: true` so DMOJ's URLs
  (`/accounts/login/`) are canonical. `src/proxy.ts` does the redirect itself and skips `/api/*`, because
  better-call matches the auth endpoints without a trailing slash.
- `src/middleware.ts` is `src/proxy.ts`: Next 16 renamed the convention.
- The root vitest config uses `test.projects`, the current form of the workspace file, in `vitest.config.mts`.
- Vitest is pinned to 4.x. Better Auth 1.7's peer range stops at 4 and npm refuses to resolve the tree with 5.
- `apps/web/src/lib/simple-markdown.tsx` renders flat pages and post summaries with a very small subset of
  markdown until `@moj/content` lands. Delete it and call `renderMarkdown` when that package exists.

## packages/core
## 2026-09-10, core
## 2026-09-10, packages/core

- 2026-09-10 (packages/core): the contest format `displayUserProblem` and `displayParticipationResult`
  return structured cell data (`state`, `points`, `pointsText`, `timeText`, `penalty`, `bonus`) instead of
  DMOJ's HTML `<td>` fragments. `packages/core` is pure domain logic and the tables are React; the fields
  carry exactly what DMOJ's markup carried, including the `pretest-` state prefix.
- 2026-09-10 (packages/core): SPEC section 7 says an ICPC rejected submission is "any non-AC result except
  CE, IE and AB". That is the MAPS fork's hall-scoreboard rule (`IGNORED_RESULTS = {IE, CE, AB}` in
  judge/utils/frozen_scoreboard.py) but not DMOJ's `icpc` contest format, which ignores only IE, CE and
  submissions with no result at all, so an aborted submission does add a penalty on the contest ranking
  page. Both behaviours are ported as they stand: `formats/icpc.ts` follows DMOJ, `scoreboard.ts` follows
  the fork. Flagged so a decision can be made deliberately if the two should be unified.
- 2026-09-10 (packages/core): `updateParticipation` takes the contest row as well as the participation,
  submissions and contest problems. The formats need `points_precision`, the participation start (which is
  derived from the contest) and, for `ecoo`, the participation end time.
- 2026-09-10 (packages/core): the schema has no field for "staff have revealed the frozen board", so
  `applyFreeze`/`isFrozenFor` take a `revealed` flag from the caller. If the reveal is to survive a page
  reload it needs a column (or a `scoreboardEvents` entry) in a later branch.
- 2026-09-10 (packages/core): with `labelScheme: "custom"`, indices past the end of `customLabels` fall
  back to letters rather than rendering an empty header.
- 2026-09-10 (packages/core): `@moj/core` has no runtime dependencies at all (zod was permitted but not
  needed; contest format config validation reproduces DMOJ's own error messages).

## 2026-09-10, content

## packages/content

- 2026-09-10: `renderMarkdown(source, preset, options?)` is asynchronous and returns
  `{html, meta}` rather than a bare HTML string. Shiki loads its grammars on demand and KaTeX
  is rendered in process, neither of which can be done synchronously without bundling every
  grammar. `meta` carries the headings, images, links, `[user:]` references, per-delimiter
  maths counts, fence languages, plain text and a summary, which the problem pages need
  anyway for `og:` tags and the editorial table of contents.
- 2026-09-10: preset names. Section 10 lists `contest` but not DMOJ's `contest_tag`; the
  package adds `contest-tag` (hyphenated, like the other multi-word presets) and a `default`
  alias, so every entry of DMOJ's `MARKDOWN_STYLES` has a preset.
- 2026-09-10: `$...$` inline maths is a MOJ addition. DMOJ's `MathInlineGrammar` has no
  single-dollar rule at all: only `$$...$$`, `\[...\]` (display) and `~...~`, `\(...\)`
  (inline). Section 10 asks for `$...$`, so it is on by default and can be turned off with
  `singleDollarMath: false`.
- 2026-09-10: `~...~` may not span a line ending. DMOJ compiles the rule with `re.DOTALL`, so
  a stray tilde swallows the rest of the paragraph; the spec asks for the single-line
  behaviour and this package implements that.
- 2026-09-10: heading demotion by two is applied to every preset, not only the statement ones.
  `AwesomeRenderer.header` is unconditional in DMOJ, and `options.demoteHeadings` overrides it
  per call.
- 2026-09-10: `rel="nofollow"` is applied for every preset, matching DMOJ (`nofollow` defaults
  to `True` in `judge.jinja2.markdown.markdown`), and `rel` is added to the sanitiser's `a`
  allowlist. DMOJ's `BLEACH_USER_SAFE_ATTRS` omits `rel`, so bleach strips the attribute its
  own renderer had just added for the staff-editable styles; that is a bug, not a rule.
- 2026-09-10: images are deferred with `loading="lazy"` and `decoding="async"` instead of
  DMOJ's `blank.gif` placeholder plus the `unveil` JavaScript, so `loading` and `decoding` are
  added to the `img` allowlist. DMOJ's skip rules are kept (`data:` sources and `*-math`
  classes are left alone).
- 2026-09-10: three more allowlist additions for markup this pipeline generates itself:
  `aria-hidden` on any element and `tabindex` on `pre` (KaTeX and Shiki emit them), and
  `data-username` / `data-rating` on `a` for the `[user:]` references the web app hydrates.
  CSS custom properties beginning `--shiki-` are allowed in `style`, which is how the dual
  GitHub themes travel; every other declaration is filtered against bleach's
  `all_styles` property list.
- 2026-09-10: elements outside the allowlist are escaped into text rather than unwrapped, so
  that `<script>void(0)</script>` comes back as `&lt;script&gt;void(0)&lt;/script&gt;` the way
  DMOJ's own `test_markdown.py` expects. A closing tag is only printed back for known HTML
  element names: parse5 builds a tree, so a made-up `<name1>` silently adopts the rest of the
  paragraph, and printing `</name1>` would add text DMOJ never shows.
- 2026-09-10: `renderPdf(typstSource, {workdir, assets, ...})` copies `typst/statement.typ` and
  `typst/booklet.typ` into the work directory and compiles with `--root` set to it, and
  `markdownToTypst` rewrites statement image paths to be root-absolute. `cmarker` evaluates
  the Typst it generates with its own package's file identity, so image paths would otherwise
  resolve inside `typst/packages/preview/cmarker/<version>/`; the template hands `cmarker` an
  `image` function of its own to move the lookup back to the compile root.
- 2026-09-10: `packages/content/typst/packages/preview/{cmarker,mitex}` are committed,
  including the two `.wasm` plugins they ship (about 600 kB together). They are a runtime
  dependency of every PDF, and vendoring them is what keeps a compile offline;
  `npm run vendor:typst` refreshes them.

## 2026-09-10, apps/judge

Section 6 names the judge API endpoints and payloads but leaves some details open. These are the choices the
judge now makes; `convex/http.ts` has to match them, and `apps/judge/README.md` documents them for operators.

- `POST /judge/event` discriminates the event on a `type` field inside `event`, so the body is
  `{judgeName, judgeKey, submissionId, event: {type, ...payload}}`. The type strings are exactly the names
  the spec lists (`grading-begin`, `batch-begin`, `batch-end`, `test-case-status`, `grading-end`,
  `compile-error`, `compile-message`, `internal-error`, `submission-terminated`).
- `GET /judge/abort` carries `judgeName` and `judgeKey` in the query string alongside `submissionId`, since
  it has no body to put them in.
- Test case objects use camelCase like the rest of the API: `totalPoints`, `extendedFeedback`. They also
  carry `voluntaryContextSwitches`, `involuntaryContextSwitches` and `runtimeVersion`, which DMOJ's bridge
  records in its json log; store or ignore them, but the schema should accept them.
- The claim response's `meta` is camelCase (`pretestsOnly`, `inContest`, `attemptNo`, `user`, `userNotes`)
  as the spec says. The judge translates it to DMOJ's dashed keys before handing it to the grader, so
  problem `init.yml` files that read `meta.user` or `meta['in-contest']` keep working.
- The spec puts the judge's problem list on `/judge/heartbeat` as an optional `problems`, so the judge sends
  problem set changes there rather than inventing an event type. Runtime changes go the same way as an
  optional `executors`. There is no ping event: in a pull protocol load reaches the site on the heartbeat.
- Every DMOJ compiled executor reports its compiler output before grading starts, even when that output is
  empty, so a `compile-message` with an empty `log` is routine. Do not surface it as a compiler warning.
- The judge container renders `/problems/judge.yml` on first start, which lands in `infra/problems/` for a
  compose stack using the volume from section 14. That path should be gitignored alongside the rest of the
  pulled problem data.

## 2026-09-10, tools/import

- `convex/importer.ts` also exports an internal mutation `patchBatch({table, patches})`. Section 15 lists
  `insertBatch`, `clearTable` and `mapping`, but `profiles.currentParticipationId` points forward at a
  `contestParticipations` document, so the importer inserts profiles first and patches that one field after the
  participations are in. `patchBatch` is used for nothing else.
- Import order deviates from section 15 in two places, both because of references the spec's order does not allow:
  `contestTags` is imported before `contests` (a contest holds `tagIds`), and `blogPosts` is imported before
  `comments` (a comment on a blog post holds the post's id in `targetKey`).
- `comments.targetKey` and `commentLocks.targetKey` hold the Convex `_id` of the blog post for `targetType: "blog"`,
  not DMOJ's numeric post id. Problems, contests and solutions keep their natural key (code or contest key).
- DMOJ's `judge_contest.problem_label_script` (a Lua snippet) has no equivalent in the schema's
  `labelScheme`/`customLabels`. A contest with a script is imported with `labelScheme: "custom"` and empty
  `customLabels`, and is listed in the import report.
- `judge_problem.date` is nullable in DMOJ but `problems.date` is required. Null becomes 0, and every such problem
  is listed in the import report.
## 2026-09-10, judging and submissions

Schema (all additive, and all optional so nothing already stored has to change):

- `submissions.abortRequested?: boolean`. `GET /judge/abort` is a poll, so the request to stop has to be
  written down somewhere between `submissions.abort` setting it and the judge reading it a second later.
- `submissions.currentBatch?: number` and `submissions.inBatch?: boolean`. DMOJ's bridge keeps the batch
  counter on the connection handler (`JudgeHandler.batch_id` / `in_batch`), which is possible because the
  judge holds a socket. The pull protocol has no connection, so the counter lives on the submission being
  graded, which is the same scope: one judge, one submission at a time.
- `submissions.by_profile_status` index (`[profileId, status]`). `DMOJ_SUBMISSION_LIMIT` counts a user's
  submissions that are not finished; without this index that is a scan of their whole history.

Decisions the wire format forced:

- **`legacyId` is the integer submission id for new submissions too, not only imported ones.** The judge
  formats the submission id into a process name with `%d` (`dmoj/judge.py:328`, on the grading path of every
  submission), so a claim that hands back a Convex document id crashes the grader with a `TypeError`.
  `submissions.submit` therefore allocates `legacyId = max(legacyId) + 1` from `by_legacyId`, and that number
  is what `/judge/claim` returns and what `/submission/<id>` should use. Convex serialises the conflicting
  mutations, so the read-then-add is safe. The judge API still accepts a document id on the way back in, as
  the brief asks; only the claim has to be a number.
- `meta.user` is the profile's `legacyUserId` when it has one and its username otherwise. DMOJ sends an
  integer user id, which only problem `init.yml` files ever read, and a fresh MOJ profile has no integer id.
- `POST /judge/event` answers `{ok: false, error: "unknown submission"}` with a 200 for an event about a
  submission that no longer exists. The judge retries an event twelve times on any failure, and there is
  nothing to retry into. An unknown *event type* is still a 400.
- Events are idempotent, because the judge retries a packet whose response was lost: `grading-begin` is
  ignored once the submission is already `G` (applying it twice would delete real case rows), `batch-begin`
  and `batch-end` are ignored when they would not change `inBatch`, a `test-case-status` case overwrites the
  row for that case number rather than inserting a second one, and `grading-end`, `compile-error`,
  `internal-error` and `submission-terminated` are ignored once the submission has reached that state.
- A `compile-message` with an empty (or whitespace-only) log is dropped rather than stored, as
  apps/judge/README.md requires: every compiled executor sends one whether or not it has anything to say.
- Judge liveness is `judges.lastSeen` rather than a socket. A judge counts as online for the tier
  calculation only if it heartbeat within `JUDGE_HEARTBEAT_TIMEOUT_MS` (60 s), so a judge that vanished
  between cron runs cannot hold the minimum tier and stall the queue.
- `POST /judge/claim` also refreshes `lastSeen`: the judge claims every 500 ms while idle, which is a
  stronger liveness signal than the ten-second heartbeat.

Behaviour worth flagging:

- The recovery cron aborts, rather than requeues, a stuck submission that has `abortRequested` set. DMOJ has
  no equivalent because its abort is synchronous; dropping the flag on the requeue would silently ignore the
  user.
- `CE`, `IE` and `AB` recompute the contest participation, which DMOJ only does on `grading-end`. It matters
  when a rejudge turns an `AC` into a `CE`: without it the participation keeps the old score.
- `submissions.submit` charges two rate limits: the `submit` bucket `convex/lib/rateLimiter.ts` already
  defines (a burst limit MOJ adds over DMOJ) and an inline `submitDaily` fixed window of 500 a day, which is
  `DMOJ_SUBMISSION_RATELIMIT` over `DMOJ_SUBMISSION_RATELIMIT_TIMEFRAME`. The inline config avoids editing
  `lib/rateLimiter.ts`, which belongs to another branch; fold it in there at integration.
- `submissions.list` filters a page for visibility after fetching it, so a page can come back shorter than
  it asked for. That is normal for Convex pagination and `usePaginatedQuery` copes; it does mean the page
  size is a hint. The query over-fetches by 4x to compensate.
- `coreProfile` derives `adminOfOrganizationIds` from the organizations the profile is a *member* of. DMOJ's
  `Organization.admins` is a separate relation, so someone who administers an organization without being in
  it would not be treated as its admin here. Every real row has admins as members; revisit if that changes.
- `recomputeProfilePoints` and `recomputeProblemStats` walk a user's and a problem's submission history and
  are capped at `RECOMPUTE_SCAN_LIMIT` (6000) rows, because a Convex transaction may read at most 16384
  documents. At club scale nothing comes close. A site that outgrows it wants a maintained per-(user,
  problem) best-points table rather than a bigger cap.
- The `submissionsByProblemResult` aggregate is still unwired: `submissions.resultsForProblem` counts by
  scanning `by_problem_date` with a cap. Wiring the aggregate means keeping it in sync on every submission
  write and rejudge, which is worth doing once one owner holds all of those.
- Profile point writes here do not touch the `profilesByPP` / `profilesByProblemCount` aggregates, which
  nothing maintains yet. Whoever wires them up has to hook `recomputeProfilePoints` too.
- `convex/crons.ts` now points "judge recovery" at `internal.judging.recoverStuckSubmissions` and "judge
  offline marking" at `internal.judgeApi.markOfflineJudges`. The two no-op stubs they used to point at are
  still in `convex/maintenance.ts` (not this branch's file to edit) and can be deleted.
- `packages/protocol` is new: `@moj/protocol/judge` holds the judge API as zod schemas, so the HTTP layer and
  any future client validate against one definition. It is the only place in the repo that depends on zod.
- `convex/_generated/api.d.ts` was extended by hand with the new modules. `npx convex codegen` needs a
  reachable deployment (it pulls the component definitions), which this worktree does not have; the next
  `convex dev` regenerates the file identically.
- Convex turns a module path with a slash into a nested API key, so the staff console mutations are
  `api.admin.submissions.batchRejudge`, not `api["admin/submissions"]`.
- Tests under `convex/__tests__/` use `convex-test` with `// @vitest-environment edge-runtime` per file, so
  the root vitest config did not need changing. `fixtures.helpers.ts` has two dots in its name on purpose:
  Convex's bundler skips any file under `convex/` whose basename does, so the fixtures never reach a
  deployment. `.test.ts` files are skipped for the same reason.
- `infra/problems/aplusb/init.yml` kept the build branch's version (flat `00.in`-`03.out`, matching the test
  data files committed there and the `problemTestCases` rows `convex/seed.ts` writes) rather than the judge
  branch's, whose `tests/*.in` paths have no files behind them. The judge branch's `config.json`, `sol.py`
  and `statement.md` were merged in alongside; `npm run e2e:judge` submits `sol.py`.
## 2026-09-10, contests

- `contests` gained `freezeRevealed: boolean` and `revealState: any`, both optional so the rows the foundation
  seeds stay valid. `freezeRevealed` is the "staff have lifted the freeze" flag `applyFreeze`/`isFrozenFor` take
  as `revealed` (the core branch flagged that it had nowhere to live); `isUnfrozen` is written alongside it and
  kept as the older alias. `revealState` holds `{ revealed: [{ participationId, cellIndex }] }`, a list of the
  cells the ceremony has opened, rather than the whole board: the board is rebuilt from the submissions on every
  read and the recorded reveals are replayed onto it, so a late judge result cannot be lost by a stale snapshot,
  and undo is a pop.
- `contests.list` returns the whole `/contests/` payload (`activeParticipations`, `current`, `future`,
  `finishedKeys`, `past`) rather than a bare `PaginationResult`, because DMOJ's page is four lists and only the
  past one is paginated. Contest visibility is a row-by-row rule that no index can express, so `past` and
  `contestRankings.ranking` paginate with an offset carried in `continueCursor`; the shape is still
  `{ page, isDone, continueCursor }`, so `usePaginatedQuery` can drive `past` once it is lifted out.
- `contests.list`'s `search` filters the past contests only, as `ContestList.get_queryset` does. `tagName` filters
  every section, because picking a tag is a browse action rather than a search.
- `contests.calendar` takes `offsetMinutes` (minutes east of UTC). DMOJ buckets contests by `timezone.localtime`;
  Convex has no notion of the viewer's timezone, so the caller passes the offset and the day keys come back as
  `YYYY-MM-DD` strings.
- Contest clarifications are `problemClarifications` rows on the contest's problems, which is what DMOJ shows
  (judge/views/blog.py:49). There is no separate contest clarification table and none was added.
- `viewer.current` gained `contestModeStale`. `Profile.update_contest()` clears contest mode on every request;
  a Convex query cannot write, so `current` reports the stale participation as `inContest: false` and the
  clearing happens in `contests.clearStaleContest` (called by the shell) or in the internal
  `jobs/contests.sweepContestMode`, which is what `maintenance.cleanupContestMode` should call.
- Contest job runners live in `convex/jobs/contests.ts` (`rescoreChunk`, `rateContestJob`,
  `rejudgeContestProblemChunk`, `mossJob`, `sweepContestMode`) with three small private helpers that own the
  `jobs` row, because `convex/jobs.ts` belongs to another agent. Note for the integrator: Convex cannot carry
  both `convex/jobs.ts` and `convex/jobs/`; if the generic module lands under that name these runners move to
  `convex/contestJobs.ts` (or the generic one moves to `convex/jobs/index.ts`).
- `convex/contestFormats.ts` is the thin format wrapper section 5 asks for and also holds the adapters between
  Convex documents and `@moj/core`'s plain rows (`toContestRow`, `toParticipationRow`, `toViewerRowInContest`
  and friends), so a rule is only translated once.
- Contest rankings live in `convex/contestRankings.ts`, not `convex/rankings.ts`: the foundation branch already
  carries `rankings.topUsers` and the users leaderboard is another agent's.
- `ratings.rateContestInternal` reproduces `Contest.rate()`: it deletes every rating produced by contests ending
  in `[contest.endTime, now]` and re-rates the rated ones in end-time order. `profiles.rating` is then set from
  each participant's most recently ended rated contest, which is DMOJ's subquery.
- Admin gates beyond `contestIsEditableBy`, taken from `Contest.Meta.permissions`:
  `judge.change_contest_visibility` for `isVisible`, `judge.lock_contest` for `lockedAfter`,
  `judge.contest_access_code` for `accessCode`, `judge.override_performance_ceiling` for
  `performanceCeilingOverride`, `judge.create_private_contest` for the two private flags, and
  `judge.contest_rating` for rating. Contest tags and scoreboard events need `judge.edit_all_contest`.
- `scoreboardEvents.theme` is validated against `default` and `olympics`; the fork's `template` hook has no
  equivalent, because the page is a React route rather than a Django template.
- MOSS is a stub, as section 12 allows: `contests.moss` answers "MOSS is not configured." unless
  `siteSettings.mossApiKey` is set, and `jobs/contests.mossJob` fails with the same message. Running MOSS needs an
  outbound call to moss.stanford.edu from an action, which nothing here has a key for.
- `convex-test` and `@edge-runtime/vm` are new devDependencies; the contest tests carry
  `// @vitest-environment edge-runtime` per file because the root vitest project runs `node`, and they declare
  `ImportMeta.glob` themselves because `convex/tsconfig.json` does not include Vite's types. `package-lock.json`
  is deliberately left uncommitted, as section 2 asks.
- `convex/_generated/api.d.ts` was hand-extended with the new modules, since `convex codegen` needs a running
  backend and the file is committed.
## 2026-09-10, problems backend

- Problems API authentication: the endpoint tries Better Auth's api-key plugin first, posting the presented key
  to `${AUTH_URL}/api/auth/api-key/verify` and mapping the returned Better Auth user id onto a profile through
  `profiles.by_userId`. Better Auth models scopes as `{resource: [action]}`, so the wire scope `problems:write`
  is `{problems: ["write"]}`. When `AUTH_URL` is unset, or the web app is not reachable from the Convex
  container (which is the case under `convex-test` and in a split deployment), it falls back to a new `apiKeys`
  table looked up by the sha256 hex of the key. Both paths require `enabled`, an unexpired `expiresAt` and the
  `problems:write` scope. The fallback is what the tests exercise.
- Schema additions, all additive: `apiKeys` (keyHash, prefix?, name, profileId, scopes[], enabled, expiresAt?,
  createdAt, lastUsedAt?, legacyId?; indexes by_keyHash, by_profile, by_legacyId);
  `problemData.zipfileStorageId` and `problemData.generatorStorageId`, because DMOJ's `zipfile` and `generator`
  are filesystem paths and MOJ keeps the blobs in Convex storage; `pdfCache.by_sourceHash`.
- `problemTestCases.points` widened from `v.number()` to `v.union(v.number(), v.null())`. DMOJ's
  `ProblemTestCase.points` is nullable and `ProblemDataCompiler.make_init` depends on it: a case inside a batch
  has its points cleared, and a null on a non-batch case is the "Points must be defined" error.
- `problems.get` returns the statement *source* plus the preset name (`problem`, or `problem-full` when
  `isFullMarkup`), not rendered HTML. Convex's V8 runtime cannot load `@moj/content`: its entry point re-exports
  the Typst renderer, which imports `node:fs` and `node:child_process`. The caller renders with
  `renderMarkdown(source, preset)`. Spec section 8's wording asks for the query to render; this is the same
  contract with the render moved one hop out.
- `problems.random` takes a `seed`. A Convex query has to be deterministic to be reactive, so DMOJ's
  `randrange(count)` becomes `seed % count` with the caller supplying the seed (the page passes a fresh one on
  each navigation).
- `problems.list` collects and filters in memory behind the most selective index it can use, with a 20 000 row
  scan cap. DMOJ's list is a single SQL query with joins Convex has no equivalent for (solved-by, has-editorial,
  type membership), and the deployment has a few hundred problems. If the corpus grows past the cap the filters
  need denormalising onto `problems`.
- Text search unions three sources: the `search_name_desc` index on the name, the `search_description` index on
  the statement, and a substring scan for the code, which is DMOJ's `code__icontains` and which no Convex search
  index can express.
- `problems.ts` exports plain helpers (`loadViewerContext`, `toCoreProblem`, `problemByCode`, `solveSetsFor`,
  `canAccessProblem`, `labelFor`, `solutionFor`) that `admin/problems.ts`, `http/problemsApi.ts`,
  `problemData.ts` and `languages.ts` import. Section 5 gives no home for shared per-area helpers and the
  problems module is the one that owns these rules.
- `admin/problems.rejudgeAll` and `rescoreAll` insert a `jobs` row and schedule `jobs:run` by name through
  `makeFunctionReference`, because `convex/jobs.ts` is another agent's file and may not exist yet. Once it lands,
  `jobs.run` reads the row's `type` (`rejudge`, `rescore`) and its `args`. Nothing else needs changing.
- `PUT /api/problems/:code` treats `authors: []` as "unchanged", per spec section 8. The club's
  `create-problem.mjs` cleared the author list in that case; almost every config.json in mcpc-problems carries
  an empty `authors` array, so the literal reading wiped the authors on every push. A non-empty list still
  replaces. The same rule applies to `testers` and `curators`.
- Statement images are served back by the API itself at `GET /api/problems/images/:storageId` rather than
  through a raw Convex storage URL, so a statement's image links stay stable across storage backends. Uploads
  are deduplicated by the sha256 of the bytes through `uploads.cacheKey`.
- The images endpoint accepts the field name `file` (spec section 8) and DMOJ's martor name
  `markdown-image-upload`, so the club's old tooling keeps working during the migration.
- `problemData.zipContents` is an action, not a query: only an action may read a stored blob
  (`ctx.storage.get`), and the zip's central directory has to be parsed out of the bytes.
- `problemData` stores `zipfile` as the plain archive file name. DMOJ stores `<code>/<name>.zip` and
  `ProblemDataCompiler` splits the first path segment off to produce `archive:`; there is no such prefix here,
  so the stored name is used as it stands.
- `tools/upload-problem/upload-problem.mjs` also reads `statment.md`, which is how one directory in
  mcpc-problems spells it.
- The root `vitest.config.mts` gained `tools/*/vitest.config.ts` to its `projects` list so `npm test` runs the
  uploader's tests.
- `apps/web` gained a `@moj/content` dependency for the PDF route.
## 2026-09-10, users, organisations and API v2

Schema (all additive, all recorded here as section 4 asks):

- `profiles.isActive?` — DMOJ's `User.is_active`. API v2's user list filters on it
  (`filter(is_unlisted=False, user__is_active=True)`) and `admin/users.deactivate` sets it.
  Absent means active, so imported rows need no backfill.
- `classes.description?` — DMOJ's `Class.description`, which section 4 omitted; the class page
  shows it.
- New indexes: `profiles.by_listed_points` (the leaderboard can sort by points, which section 4
  gave no index for), `classes.by_organization_slug` (a class is addressed by organisation slug
  plus class slug), `organizationRequests.by_profile_state` ("do you already have a pending
  request" without a scan), `jobs.by_creator_type_createdAt` (a user's latest `userExport` job).

Behaviour and interpretation:

- Markdown is never rendered inside Convex. `@moj/content` pulls in Shiki, whose default engine
  is WASM, which does not belong in a Convex isolate. `profiles.userPage` and
  `organizations.get` return `about` as source alongside the preset name the page must use
  (`self-description` and `organization-about`), and the web layer renders it. Every other
  Convex module on this branch already worked that way.
- API v2 object ids. DMOJ exposes Django primary keys. MOJ keeps them in `legacyId` for imported
  rows and has none for rows created afterwards, so `id` is `number | string`: the Django id
  where there is one, the Convex document id otherwise. `?id=` filters accept either spelling.
  `/api/v2/submission/[id]` accepts either too.
- API v2 list endpoints scan at most 20000 rows before paginating. DMOJ filters for visibility
  in SQL and paginates in the database; Convex has to apply `@moj/core`'s rules in the function,
  so the scan is bounded and `has_more` stays true past the cap rather than lying.
- `organizations.join` also checks the access code and the slot limit. DMOJ's
  `JoinOrganization.handle` checks neither (only the request-approval path counts slots), but
  both were asked for. The other three rules are DMOJ's verbatim: already a member, organisation
  not open, and at most `DMOJ_USER_MAX_ORGANIZATION_COUNT` (3) open organisations.
- `classes.join` takes an access code. DMOJ's `Class.access_code` field exists but its only
  join path is a request; the club hands the code out in a lab, so a code join was added beside
  it. A class join still requires organisation membership, as `RequestJoinClass` does.
- `profiles.updateProfile` exposes `usernameDisplayOverride` to staff only. DMOJ only exposes
  `username_display_override` through the Django admin, and `ProfileForm` never carries it.
- The leaderboard's tie order. `by_listed_pp` and its siblings order ties by document id in the
  same direction as the sort column, where DMOJ's `order_by(self.order, 'id')` always breaks
  ties ascending, so the page is re-sorted after the index read. `rankings.find` counts
  "performance points greater than" and "equal points, smaller id" as two bounded aggregate
  counts, which is `user_ranking_redirect`'s arithmetic exactly.
- The three profile aggregates have no automatic trigger. Every mutation that inserts a profile
  or changes `performancePoints`, `points`, `problemCount`, `rating` or `isUnlisted` goes
  through `rankings.patchProfile` / `insertProfileAggregates`. Other modules that write those
  fields (the judging bookkeeping, ratings) must do the same. `rankings.rebuildAggregates`
  (internal, paginated) repairs the tree after an import, which writes rows straight into the
  table; `rankings.repairAggregates` is the staff-facing one-shot version.
- API v2 authentication mints a short-lived JWT. `apps/web/src/lib/apiAuth.ts` resolves the
  Bearer token (api-key plugin key, then legacy DMOJ token), then signs a five-minute JWT for
  that user with `auth.api.signJWT` through the same JWKS the jwt plugin uses for browser
  sessions, and passes it to `fetchQuery`. Convex already trusts those keys through the
  `customJwt` provider, so there is one trust path and no shared secret to keep in step. The
  alternative in the brief (an action plus a shared secret) would have added a second one.
- `LEGACY_SECRET_KEY` is a new environment variable: the Django `SECRET_KEY` of the site being
  imported from, used to verify legacy 48-character API tokens against
  `profiles.legacyApiTokenHash`. Without it, legacy tokens are simply rejected and api-key
  plugin keys still work. It belongs beside `AUTH_SECRET` in `infra/.env.example`.
- `apps/web/vitest.config.ts` gained `resolve.alias` for `@/` and `@convex/`. The tsconfig
  `paths` are compile-time only and vitest could not resolve either.
- Convex function tests live in `convex/tests/*.test.ts` with two shared helpers named
  `convexTest.setup.ts` and `fixtures.setup.ts`. Convex's bundler skips any entry point whose
  basename has more than one dot, so neither the tests nor the helpers reach a deployment.
- `fflate` is a new root dependency: the `userExport` job builds its zip with `zipSync` inside a
  Convex action.
- Impersonation is Better Auth's admin plugin (`authClient.admin.impersonateUser`), so no Convex
  function exposes it. `admin/users.deactivate` only marks the profile and hands the route the
  Better Auth user id to ban.
## 2026-09-10, community and site admin

- Rendered markdown does not cross the Convex boundary. `@moj/content`'s package entry pulls in
  `node:child_process` and `node:fs` through the Typst renderer, and the Shiki highlighter needs WASM, so no
  Convex query or mutation can call `renderMarkdown`. Every module that returns user-written text returns the
  markdown together with the preset the consumer must render it with: `comments.list` returns
  `{ body, bodyPreset: "comment" }`, `blog.get` returns `contentPreset: "blog"`, `site.flatPage` returns
  `contentPreset: "flatpage"`, `site.license` returns `textPreset: "license"`, `tickets.get` returns
  `bodyPreset: "ticket"`, `judges.list` returns `descriptionPreset: "judge"` and `languages.detail` returns
  `descriptionPreset: "language"`. The web app renders them; the feed routes do the same before building the
  XML. Nothing else about the presets changes.
- The feed route handlers still render through `apps/web/src/lib/simple-markdown.tsx` (the foundation branch's
  placeholder) via `renderToStaticMarkup`, because `@moj/content` is not yet a dependency of `apps/web` and its
  `exports` map points at an unbuilt `dist`. `apps/web/src/app/feed/items.ts` carries the one-line swap.
- Comment ordering: DMOJ's `Comment` is an MPTT model with `order_insertion_by = ['-time']`, which orders
  *every* level newest first. `comments.list` keeps that for the top level and orders replies oldest first
  inside a thread, per the build brief, so a conversation reads downwards. Ties break on document id.
- `comments.list` returns hidden comments to holders of `judge.change_comment`, flagged `hidden: true`, so the
  hide can be undone from the page. DMOJ filters `hidden=False` for everyone and only offers `unhide` from the
  Django admin.
- `comments.list` returns a flat array ordered for rendering, with `parentId` and `depth` on each row, rather
  than a nested tree: Convex validators cannot express a recursive return type and the flat form is what the
  template walks anyway.
- `blog.list({ limit })` keeps the array shape the foundation branch's home page already consumes;
  `/blog/` uses the new `blog.paginated({ paginationOpts })`.
- `blog.paginated`, `tickets.list` and `admin/tickets.list` return `{ page, isDone, continueCursor, totalCount }`
  with an integer offset encoded in the cursor, not a Convex index cursor. The blog list is ordered
  `-sticky, -publish_on` and the ticket lists are filtered per viewer, and neither ordering can be expressed as
  a single index range. `totalCount` is what DMOJ's "Page x of y" bar needs.
- Ticket notes are restricted to `judge.change_ticket` holders and the linked problem's editors.
  `TicketNotesEditView` is gated only by `TicketMixin`, so in DMOJ the reporter can technically write the staff
  notes; only the template hides the control.
- `stats.ts` serves the `/stats/language/` charts from a `statsSnapshots` row instead of a `GROUP BY`. Convex
  has no aggregate query, so `stats.refresh` (an internal mutation, for a cron in section 12) tallies up to
  50,000 submissions and stores the counts; the queries read the snapshot and fall back to computing one from
  20,000 rows when there is none. `truncated` says whether the tally saw the whole table.
- Judge authentication keys are stored only as their SHA-256 (`judges.authKeyHash`, which the schema already
  named). `admin/judges.create` and `admin/judges.regenerateKey` return the generated key once and it cannot be
  recovered afterwards. DMOJ keeps `Judge.auth_key` in the clear.
- `Judge.disconnect` sends a socket packet to the bridge in DMOJ. The pull-model judge has no inbound socket, so
  `admin/judges.disconnect` sets `disconnectRequestedAt`/`disconnectForce` and the judge acts on it at its next
  heartbeat; `admin/judges.clearDisconnect` clears the flag once it has been served.
- `admin/languages.copyLanguage` is the `copy_language` management command as a mutation. DMOJ's
  `target.problem_set.set(source.problem_set.all())` *replaces* the target's problem set, so the mutation also
  removes the target language from problems that do not allow the source.
- Feeds and the sitemap are always built for an anonymous reader, matching `CommentFeed.items`' explicit
  `AnonymousUser()`, so a signed-in staff member's feed never contains more than a logged-out one's.
- `NEXT_PUBLIC_SITE_URL` is the name the feed routes read for absolute links; the compose files set
  `NEXT_PUBLIC_APP_URL`, so `apps/web/src/app/feed/xml.ts` accepts either, in that order.
- Schema additions (all optional or new, nothing renamed or removed):
  `judges.createdAt`, `judges.disconnectRequestedAt`, `judges.disconnectForce`;
  a `blogPosts.by_visible_sticky_publishOn` index and a `tickets.by_time` index;
  `siteSettings.ticketsPerPage`, `.enableComments`, `.commentVoteHideThreshold`, `.commentReplyTimeframeDays`,
  `.commentMaxBodyLength`, `.blogNewProblemCount`, `.statsLanguageThreshold`, `.submissionSourceVisibility`,
  `.submissionLimitPerMinute`, `.maxSubmissionsPerProblem`, `.ppStep`, `.ppEntries`;
  and a new `statsSnapshots` table (`key`, `computedAt`, `data`) with a `by_key` index.
- Two files outside the brief's list were added because they are new and cannot collide with another branch:
  `convex/lib/community.ts` (the helpers every community module shares: the `@moj/core` row adapter, the viewer
  builder, comment-target resolution, `has_any_solves`, revision writes, judge key generation and the offset
  pager) and `convex/lib/testing.ts` (row builders for the Convex test suites). `convex/_generated/api.d.ts` was
  updated by hand for the new modules because `convex codegen` needs a live deployment.
- Root `package.json` gained `@moj/core` as a dependency and `convex-test`, `@edge-runtime/vm` and
  `fast-xml-parser` as dev dependencies; `apps/web/vitest.config.ts` gained the `@/` and `@convex/` aliases the
  feed tests need.
