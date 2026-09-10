# MOJ, the MAPS Online Judge: build specification

This is the contract every builder agent works against. Read it fully before writing code. If you need something
the spec does not define, add it to `docs/SPEC_CHANGES.md` in your branch (append a dated bullet) and proceed;
do not silently invent a competing convention.

MOJ is a TypeScript rewrite of DMOJ (the Don Mills Online Judge) for MAPS, Monash Algorithms and Problem Solving.
It must be feature-compatible with DMOJ as deployed at judge.monashaps.com: same URLs, same page skeleton and
button placement, same statement format, same problem-repo workflow, same accounts (imported), and the DMOJ
judge-server as the grader. Visual design is DMOJ's layout with a light modernisation through design tokens.

## 1. Stack

- Node 24, npm workspaces (no pnpm, no yarn). TypeScript 5, `strict: true`, ESM everywhere.
- `apps/web`: Next.js (latest stable, App Router, React 19), Tailwind CSS v4, Radix primitives (shadcn-style
  components copied into `packages/ui`), TanStack Table, CodeMirror 6, Lucide icons, date-fns, KaTeX CSS.
- `convex/`: Convex 1.45+ functions and schema, deployed to a self-hosted backend. Components:
  `@convex-dev/aggregate` (ranks and counts), `@convex-dev/rate-limiter`.
- Auth: Better Auth 1.7 running inside `apps/web`, Drizzle ORM on Postgres, plugins: `username`, `twoFactor`,
  `@better-auth/passkey`, `admin`, `@better-auth/api-key`, `bearer`, `jwt`. Convex trusts Better Auth JWTs
  through a `customJwt` provider in `convex/auth.config.ts`.
- `apps/judge`: DMOJ judge-server (MonashAPS fork, branch v2) built into a Docker image with our replacement
  `packet.py` that talks to Convex over HTTPS (pull model). Python 3, `convex` PyPI client.
- `packages/core`: pure domain logic, no I/O. `packages/content`: markdown pipeline and markdown-to-Typst.
  `packages/protocol`: zod schemas shared by judge API, problems API and API v2. `packages/ui`: tokens and
  components.
- Tests: vitest (`npm test` at root runs all workspaces). Playwright for a small e2e smoke in `apps/web`.
- Formatting and lint: Biome (`npm run lint`, `npm run format`).
- PDF: the Typst binary (`typst` on PATH inside the web container, or `TYPST_BIN` env for local dev), with the
  `cmarker` and `mitex` packages vendored under `packages/content/typst/packages`.

CPU rule for this machine: prefix every install, build, test and docker build with `taskset -c 0-11,14-31`.

## 2. Repository layout

```
MOJ/
  package.json            npm workspaces: apps/*, packages/*
  tsconfig.base.json
  biome.json
  convex/                 schema.ts, auth.config.ts, *.ts function modules, crons.ts, http.ts, _generated/
  apps/web/               Next.js app (src/app routes, src/components, src/lib, src/auth, drizzle/)
  apps/judge/             Dockerfile, moj_packet.py, entrypoint, judge.yml template, README
  packages/core/          permissions, contest formats, ratings (Elo-MMR), points, verdicts, scoreboard freeze
  packages/content/       unified pipeline, tilde math, sanitiser presets, Shiki, markdown-to-Typst, typst templates
  packages/protocol/      zod schemas: judge API payloads, problems API, API v2 envelopes
  packages/ui/            tokens.css, components (Button, Tabs, Table, Dialog, Select, Tooltip, Badge, Pill...)
  tools/import/           MariaDB dump -> Convex JSONL + Better Auth rows
  tools/upload-problem/   upload-problem.mjs for problem repos (replaces create-problem.mjs)
  infra/                  compose.dev.yml, compose.prod.yml, Caddyfile, env examples, scripts
  docs/                   SPEC.md (this), SPEC_CHANGES.md, RUNBOOK.md
```

Git rules: conventional commits, lowercase imperative subject, no Claude or Anthropic attribution of any kind,
never commit `node_modules`, `.env*` (except `.env.example`), `convex/_generated` is committed. Do not commit
`package-lock.json` from a worktree branch; the integrator regenerates it once.

## 3. Identity, roles and permissions

- Better Auth `user.id` (string) is the identity everywhere. Convex functions read it from
  `ctx.auth.getUserIdentity()?.subject`.
- `profiles` (Convex) is keyed by `userId` and carries everything DMOJ's Profile had plus `username`
  (denormalised from Better Auth for display and search), `isStaff`, `isSuperuser`, `permissions: string[]`.
- Permission codes are DMOJ's, verbatim, e.g. `judge.edit_all_problem`, `judge.see_private_contest`,
  `judge.rejudge_submission`, `judge.view_all_submission`, `judge.edit_all_post`, `judge.organization_admin`,
  `judge.contest_rating`, `judge.lock_contest`, `judge.spam_submission`, `judge.test_site`, `judge.totp`,
  `judge.change_public_visibility`, `judge.problem_full_markup`, `judge.clone_problem`, `judge.moss_contest`.
  `packages/core/src/permissions.ts` exports `hasPerm(profile, code)`, `isSuperuser`, and every DMOJ rule as a
  pure function: `problemIsAccessibleBy`, `problemIsEditableBy`, `contestAccessCheck` (returns
  `{ok} | {inaccessible} | {privateContest, organizationIds}`), `contestIsEditableBy`, `canSeeSubmissionDetail`,
  `canSeeFullScoreboard`, `canSeeOwnScoreboard`, `solutionIsAccessibleBy`, `blogPostCanSee`,
  `commentIsAccessibleBy`. Rules are DMOJ's exactly (see docs/DMOJ_RULES.md for the extracted rule text).
- Staff 2FA: users with `isStaff` must have two-factor enabled; enforced in the web middleware exactly as DMOJ's
  `DMOJ_REQUIRE_STAFF_2FA` (staff cannot disable their last factor).
- Contest mode: `profiles.currentParticipationId` set on join; while set and the participation is live, the site
  behaves as DMOJ's contest mode (problem list shows only contest problems, submissions filtered, `/users` shows
  the contest scoreboard, editorials hidden, voting disabled). A query helper `viewer.current()` returns
  `{ profile, participation, contest, inContest }` for pages.

## 4. Data model (convex/schema.ts)

Field names are camelCase versions of DMOJ's. Every imported table has `legacyId: v.optional(v.number())` with an
index `by_legacyId`. Timestamps are `v.number()` (ms since epoch). Durations in seconds unless noted. Money-free.

Tables (fields abbreviated; implement all of them):

- `profiles`: userId, username, legacyUserId, about, timezone, languageId, points, performancePoints,
  problemCount, rating?, displayRank ("user"|"setter"|"admin"), mute, isUnlisted, isBannedFromProblemVoting,
  currentParticipationId?, mathEngine, siteTheme ("auto"|"light"|"dark"), editorTheme, lastAccess?, ip?, notes,
  legacyApiTokenHash?, dataLastDownloaded?, usernameDisplayOverride?, isStaff, isSuperuser, permissions[],
  groups[], joinDate. Indexes: by_userId, by_username, by_legacyUserId, by_listed_pp [isUnlisted, performancePoints],
  by_listed_rating, by_listed_problemCount, search index on username.
- `organizations`: name, slug, shortName, about, adminProfileIds[], isOpen, slots?, accessCode?,
  logoOverrideImage?, classRequired, memberCount. Index by_slug.
- `organizationMemberships`: organizationId, profileId, order. Indexes by_organization, by_profile.
- `classes`: organizationId, name, slug, isActive, accessCode?, adminProfileIds[], memberProfileIds[].
- `organizationRequests`: profileId, organizationId, classId?, time, state ("P"|"A"|"R"), reason.
- `problemTypes`, `problemGroups`: name, fullName. `licenses`: key, link, name, display, icon, text.
- `problems`: code, name, description, authorProfileIds[], curatorProfileIds[], testerProfileIds[], typeIds[],
  groupId, timeLimit (float s), memoryLimit (KB), shortCircuit, points, partial, allowedLanguageIds[], isPublic,
  isManuallyManaged, date, bannedProfileIds[], licenseId?, ogImage?, summary?, userCount, acRate, isFullMarkup,
  submissionSourceVisibility ("A"|"S"|"O"|"F"), organizationIds[], isOrganizationPrivate. Indexes by_code,
  by_public_date [isPublic, date], by_public_points, search index `search_name_desc` on name with filter isPublic
  (and a second on description). Code regex `^[a-z.0-9]+$`, max 20.
- `problemTranslations`: problemId, language, name, description. `problemClarifications`: problemId,
  description, date. `languageLimits`: problemId, languageId, timeLimit, memoryLimit (index by_problem).
- `solutions`: problemId (unique), isPublic, publishOn, authorProfileIds[], content.
- `problemPointsVotes`: points, voterProfileId, problemId, voteTime, note.
- `problemData`: problemId, zipfile?, generator?, outputPrefix?, outputLimit?, feedback, checker?, checkerArgs?,
  unicode, nobigmath. `problemTestCases`: problemId, order, type ("C"|"S"|"E"), inputFile, outputFile,
  generatorArgs, points, isPretest, outputPrefix?, outputLimit?, checker?, checkerArgs?, batchDependencies.
- `languages`: key, name, shortName, commonName, editorMode, shikiLang, template, info, description, extension.
  Index by_key.
- `judges`: name, authKeyHash (sha256 hex of the key), isBlocked, isDisabled, tier, online, startTime?, ping?,
  load?, description, lastIp?, problemCodes[], runtimeKeys[], lastSeen?, currentSubmissionId?. Index by_name.
- `runtimeVersions`: languageId, judgeId, name, version, priority. Index by_judge, by_language.
- `submissions`: profileId, problemId, date, time?, memory?, points?, languageId, status ("QU"|"P"|"G"|"D"|"IE"|
  "CE"|"AB"), result? ("AC"|"WA"|"TLE"|"MLE"|"OLE"|"IR"|"RTE"|"CE"|"IE"|"SC"|"AB"), error?, currentTestcase, batch,
  casePoints, caseTotal, judgedOnJudgeId?, judgedDate?, rejudgedDate?, isPretested, contestId?, contestProblemId?,
  participationId?, contestPoints?, isContestPretest?, lockedAfter?, isArchived, priority (0..3), judgePin?,
  claimedByJudgeId?, claimedAt?, retryCount. Indexes: by_date [date], by_profile_date, by_problem_date,
  by_contest_date, by_profile_problem, by_problem_profile, by_status_priority [status, priority, date],
  by_participation, by_problem_status, by_language_date.
- `submissionSources`: submissionId, source (index by_submission).
- `submissionTestCases`: submissionId, case, status, time, memory, points, total, batch?, feedback, extendedFeedback,
  output (index by_submission_case).
- `contests`: key, name, authorProfileIds[], curatorProfileIds[], testerProfileIds[], spectatorProfileIds[],
  testerSeeScoreboard, testerSeeSubmissions, description, startTime, endTime, timeLimit?, isVisible, isRated,
  viewContestScoreboardProfileIds[], viewContestSubmissionsProfileIds[], scoreboardVisibility ("V"|"C"|"P"|"H"),
  useClarifications, ratingFloor?, ratingCeiling?, performanceCeilingOverride?, rateAll, rateExcludeProfileIds[],
  isPrivate, privateContestantProfileIds[], hideProblemTags, hideProblemAuthors, runPretestsOnly, showShortDisplay,
  isOrganizationPrivate, organizationIds[], limitJoinOrganizations, joinOrganizationIds[], classIds[], ogImage?,
  logoOverrideImage?, tagIds[], userCount, summary?, accessCode?, bannedProfileIds[], formatName, formatConfig
  (any), labelScheme ("letters"|"numbers"|"custom"), customLabels[], lockedAfter?, pointsPrecision,
  freezeMinutes (0 = no freeze), blindDuringFreeze (contestants see "pending" instead of verdicts after the freeze
  point). Index by_key, by_visible_start, by_end.
- `contestProblems`: contestId, problemId, points, partial, isPretested, order, outputPrefixOverride?,
  maxSubmissions?. Index by_contest_order, by_problem.
- `contestParticipations`: contestId, profileId, realStart, score, cumtime, isDisqualified, tiebreaker, virtual
  (0 live, -1 spectate, n>0 virtual), formatData (any), legacyId. Indexes by_contest_virtual_score [contestId,
  virtual, score], by_profile_contest, by_contest_profile.
- `ratings`: profileId, contestId, participationId, rank, rating, mean, performance, lastRated. Index by_profile,
  by_contest.
- `contestTags`: name, color, description. `contestMoss`: contestId, problemId, languageKey, submissionCount, url.
- `comments`: targetType ("problem"|"contest"|"blog"|"solution"), targetKey (problem code, contest key, blog id,
  solution problem code), parentId?, authorProfileId, time, score, body, hidden, revisions. Indexes by_target_time,
  by_parent, by_author.
- `commentVotes`: voterProfileId, commentId, score. `commentLocks`: targetType, targetKey.
- `blogPosts`: title, authorProfileIds[], slug, visible, sticky, publishOn, content, summary, ogImage?.
- `tickets`: title, profileId, time, assigneeProfileIds[], notes, linkedType?, linkedKey?, isOpen.
  `ticketMessages`: ticketId, profileId, body, time.
- `navigationBar`: order, key, label, path, regex, parentId?. `miscConfig`: key, value. `flatPages`: url, title,
  content, enableComments? (index by_url). `siteSettings`: single document for things DMOJ kept in settings.
- `revisions`: entityType, entityId, snapshot (any), authorProfileId?, reason, createdAt. Index by_entity.
- `jobs`: type, status ("queued"|"running"|"done"|"failed"), progress {done,total,stage}, args, result?, error?,
  createdByProfileId?, createdAt, finishedAt?.
- `scoreboardEvents`: key, name, contestIds[], theme, flagUrlTemplate?, badgeOrganizationSlugs[], inPersonOrganizationSlug?,
  freezeMinutes, isPublic. (The hall scoreboard config, replacing MCPC_SCOREBOARDS.)
- `uploads`: storageId, uploaderProfileId, kind ("statement-image"|"export"|"pdf"|"logo"), name, createdAt,
  cacheKey?. `pdfCache`: problemCode, language, storageId, renderedAt, sourceHash.

Aggregates (`@convex-dev/aggregate`): `profilesByPP` (namespace: listed), `profilesByRating`, `profilesByProblemCount`,
`submissionsByProblemResult` (counts for stats). Rate limiter: `submit` (per user), `register` (per ip),
`passwordReset`, `commentPost`.

## 5. Convex modules and naming

One file per area under `convex/`: `viewer.ts`, `profiles.ts`, `organizations.ts`, `problems.ts`, `problemData.ts`,
`submissions.ts`, `judging.ts` (grading bookkeeping shared by judgeApi and rejudge), `judgeApi.ts` (functions the
judge calls), `contests.ts`, `contestFormats.ts` (thin wrappers over packages/core), `rankings.ts`, `ratings.ts`,
`scoreboard.ts` (hall scoreboard + freeze), `comments.ts`, `blog.ts`, `tickets.ts`, `languages.ts`, `judges.ts`,
`site.ts` (nav, misc config, flat pages, settings), `admin/*.ts` (staff console mutations, all permission-checked),
`jobs.ts`, `crons.ts`, `http.ts` (HTTP actions: judge API for Python, problems API, API v2 when not served by Next,
health), `lib/` (auth helpers, pagination, errors).

Conventions: queries never throw for "not found" on list pages (return null); mutations throw `ConvexError` with
`{code, message}`. Every public query that returns per-user-sensitive data calls `requireViewer(ctx)` or
`optionalViewer(ctx)` from `convex/lib/auth.ts`. Pagination uses `paginationOptsValidator`. All permission checks
go through `packages/core`.

## 6. Judge API (pull model)

The judge authenticates with `{ judgeName, judgeKey }` on every call; `judgeApi` verifies sha256(key) against
`judges.authKeyHash` and `isBlocked`. Functions (HTTP actions under `/judge/*` in `convex/http.ts` for the Python
client, each also exposed as an internal mutation):

- `POST /judge/handshake` `{judgeName, judgeKey, problems: [[code, mtime]], executors: {LANG: [[name, [ver]]]}}`
  -> `{ok, judgeId}`; sets online, problemCodes, runtimeKeys, runtimeVersions, lastIp, startTime.
- `POST /judge/heartbeat` `{judgeName, judgeKey, load, problems?}` every 10 s -> `{ok, serverTime}`.
- `POST /judge/claim` `{judgeName, judgeKey}` -> `{submission: null | {submissionId, problemCode, languageKey, source,
  timeLimit, memoryLimit, shortCircuit, meta: {pretestsOnly, inContest, attemptNo, user, userNotes}}}`.
  Claim rules (implemented in `judging.claimNext`): candidates are submissions with status `QU` ordered by
  [priority asc, date asc]; the judge must have the problem code and the language key; if `judgePin` is set only
  that judge may claim; only judges in the minimum online tier claim; if more than one judge in the tier is online
  and at most one is free, priorities >= 2 (rejudge) are skipped; claiming sets status `P`, `claimedByJudgeId`,
  `claimedAt`, `judgedOnJudgeId`, `judges.currentSubmissionId`.
- `POST /judge/event` `{judgeName, judgeKey, submissionId, event}` where event is one of
  `grading-begin {pretested}`, `batch-begin`, `batch-end`, `test-case-status {cases: [{position, status (bitmask),
  time, memory, points, totalPoints, output, feedback?, extendedFeedback?}]}`, `grading-end`, `compile-error {log}`,
  `compile-message {log}`, `internal-error {message}`, `submission-terminated`. Status bitmask decode order:
  4 TLE, 8 MLE, 64 OLE, 2 RTE, 16 IR, 1 WA, 32 SC, else AC.
- `GET /judge/abort?submissionId=` -> `{abort: boolean}`, polled by the judge every second while grading.
- `POST /judge/disconnect`.
- `grading-end` bookkeeping (in `judging.finish`): sum case time, max memory, batched cases collapse to (min points,
  max total) per batch, result = worst status by ['SC','AC','WA','MLE','TLE','IR','RTE','OLE'] index, points =
  round(casePoints/caseTotal*problem.points, 3) zeroed when not partial and not full, status `D`; then
  profile points/PP/problemCount recompute (public, non-org-private problems only), problem userCount/acRate,
  participation recompute via the contest format, `judges.currentSubmissionId` cleared.
- Recovery: cron every minute: submissions in `P`/`G` whose judge has no heartbeat for 60 s or whose `claimedAt`
  is older than 15 min with no case progress go back to `QU` once (`retryCount` 1), otherwise become `IE`.
- Priorities: 0 contest, 1 default, 2 rejudge, 3 batch rejudge.

Rejudge/rescore: `admin/submissions.rejudge` resets a submission to `QU` (deleting case rows, clearing fields as DMOJ
does) unless status is `P`/`G`; batch rejudge creates a `jobs` document and schedules chunks of 100.

## 7. Contest formats, freeze and the hall scoreboard

`packages/core/src/formats/*`: `default`, `ioi` (legacy), `ioi16`, `atcoder` (penalty default 5), `icpc` (penalty
default 20), `ecoo` (cumtime false, first_ac_bonus 10, time_bonus 5). Interface as DMOJ's:
`validate(config)`, `updateParticipation(participation, submissions, contestProblems) -> {score, cumtime, tiebreaker,
formatData}`, `displayUserProblem`, `displayParticipationResult`, `getProblemBreakdown`, `getLabelForProblem`,
`getShortFormDisplay`. Algorithms must match DMOJ exactly (see docs/DMOJ_RULES.md).

ICPC rules (for the icpc format and the hall scoreboard): a problem counts once when first accepted; penalty for a
solved problem = minutes from participation start to the accepted submission + penalty * number of rejected
submissions before it; rejected means any non-AC result except CE, IE and AB; unsolved problems add no penalty;
rank by solved desc, then total penalty asc, then last accepted time asc (DMOJ's icpc uses cumtime as penalty and
tiebreaker as last solve). Ties share a rank on the hall board.

Freeze: `contests.freezeMinutes > 0` freezes the public board at `endTime - freezeMinutes*60s`. Submissions after
the freeze point show as pending (`?`) to everyone except contest editors (and users listed in
`viewContestScoreboardProfileIds`), on the contest ranking page and the hall scoreboard alike. Each contestant still
sees their own verdicts unless `blindDuringFreeze` is true, in which case their submission rows and the per-case
view show "pending" until the contest ends (staff still see everything). Rankings during a freeze are computed from
pre-freeze data only. After `endTime`, the board stays frozen until a staff member reveals it (`scoreboard.reveal`
mutation, stepwise from the bottom as in the MAPS fork, with undo) or unfreezes it entirely; virtual participants
are never frozen.

Hall scoreboard (`/scoreboard/[event]`): config from `scoreboardEvents`; always ICPC scoring regardless of format;
several contests shown as divisions with a carousel; cell states solved / frozen / judging / failed / empty; first
blood highlighted; badges from organisation membership; All / In-person toggle; keyboard shortcuts (arrows, P, F,
I, E, R); reveal ceremony for staff. Ignores `scoreboardVisibility`, so treat the URL as public. Themes: default
and `olympics` (sport pictograms replace labels, gold medal for first blood). This page is a reactive query; no
polling.

## 8. Routes (must match DMOJ)

Public: `/`, `/problems/`, `/problems/random/`, `/problem/[code]`, `/problem/[code]/editorial`, `/problem/[code]/pdf`,
`/problem/[code]/submit`, `/problem/[code]/resubmit/[id]`, `/problem/[code]/rank/`, `/problem/[code]/submissions/`,
`/problem/[code]/submissions/[user]/`, `/problem/[code]/test_data`, `/problem/[code]/vote`, `/problem/[code]/manage/submission`,
`/submissions/`, `/submissions/user/[user]/`, `/submission/[id]`, `/submission/[id]/abort`, `/src/[id]`, `/src/[id]/raw`,
`/users/`, `/user`, `/user/[user]`, `/user/[user]/solved`, `/user/[user]/submissions/`, `/edit/profile/`,
`/data/prepare/`, `/data/download/`, `/contests/`, `/contests.ics`, `/contest/[key]`, `/contest/[key]/ranking/`,
`/contest/[key]/join`, `/contest/[key]/leave`, `/contest/[key]/stats`, `/contest/[key]/participations`,
`/contest/[key]/moss`, `/contest/[key]/clone`, `/contest/[key]/rank/[problem]/`, `/contest/[key]/submissions/[user]/`,
`/organizations/`, `/organization/[pk]-[slug]` (+ `/users`, `/join`, `/leave`, `/edit`, `/kick`, `/request`,
`/requests/pending|log|approved|rejected`, `/class/[cpk]-[cslug]`), `/blog/`, `/post/[id]-[slug]`, `/tickets/`,
`/ticket/[pk]`, `/comments/...` (ajax endpoints become mutations), `/runtimes/`, `/runtimes/matrix/`, `/status/`,
`/stats/language/`, `/license/[key]`, `/about/` and other flat pages by url, `/scoreboard/[event]`, `/sitemap.xml`,
`/feed/problems/rss|atom/`, `/feed/comment/rss|atom/`, `/feed/blog/rss|atom/`.
Accounts: `/accounts/login/`, `/accounts/logout/`, `/accounts/register/`, `/accounts/activate/[key]/`,
`/accounts/password/change/`, `/accounts/password/reset/`, `/accounts/reset/confirm/[token]/`,
`/accounts/2fa/` (+ `enable`, `edit`, `disable`, `webauthn/attest`, `webauthn/assert`, `scratchcode/generate`),
`/accounts/api/token/generate/`, `/accounts/email/change/`.
API: `/api/v2/{contests,contest/[key],problems,problem/[code],users,user/[user],submissions,submission/[id],
organizations,participations,languages,judges}` with DMOJ's exact envelope
`{api_version:"2.0", method, fetched, data:{objects|object, current_object_count, objects_per_page, total_objects,
page_index, total_pages, has_more}}`, `{error:{code,message}}` on failure, Bearer auth (48-char tokens: legacy
verified with the old key, new ones from the api-key plugin), `?page=`, filters as DMOJ (`basic_filters`,
`list_filters`).
Problems API: `PUT /api/problems/[code]` (JSON: name, statement, editorial {content, isPublic, publishOn},
points, timeLimit, memoryLimit, shortCircuit, isPublic, authors[], testers[], group, types[], languageLimits
{python3?, pypy3?: {timeLimit, memoryLimit}}, publishOn); partial update semantics: absent = unchanged,
`authors: []` = unchanged, group/types/publishOn/checkAll are create-only (create sets group and types to
`uncategorized`, publishOn now, allowed languages = all); create requires name. `POST /api/problems/[code]/images`
multipart `file` -> `{status: 200, link}`. Auth: API key with `problems:write` scope. `DELETE` not supported.
Staff console: `/admin` with sections problems, contests, submissions, users, organizations, classes, judges,
languages, navigation, config, flatpages, blog, licenses, tags, tickets, jobs, scoreboards. Every list has search,
filters and pagination; every edit writes a revision with a reason field.

## 9. Page skeleton and design tokens

Skeleton (DMOJ's, keep it): fixed 44 px dark nav (`--nav #3b3b3b`) with the MAPS logo at left (`/logo.svg`,
inverted wordmark on dark), nav items from `navigationBar`, user block at right (gravatar + "Hello, username" with a
hover dropdown: Admin, Edit profile, Stop impersonating, Log out; or "Log in or Sign up"); 3 px `#nav-shadow`; hamburger
under 760 px. Contest floater box bottom-right when in contest mode with a live countdown, draggable, position in
localStorage. `main#content` with `h2` title row, optional tab bar directly under the title (`make_tab`: icon +
text, active tab has a top border in the accent colour), `hr`, then body. Common two-column content: main column
left with `.content-description`, `.info-float` sticky sidebar right (top: 70 px), stacked under 700 px. Footer:
"proudly powered by MOJ" line, misc-config footer, language switcher select. Announcement box bottom-right from
misc config. Table skin `.table` with striped rows and a dark header band (lightened in the new tokens).

Tokens (`packages/ui/src/tokens.css`, light and dark via `:root`, `@media (prefers-color-scheme: dark)` guarded by
`:root:not([data-theme="light"])`, and `:root[data-theme="dark"]`): `--nav: #3b3b3b`, `--accent: #2980b9`
(dark: #5fa8dc), `--bg`, `--surface`, `--ink`, `--ink-2`, `--muted`, `--line`, `--code-bg`, verdict colours (AC
green, WA red, TLE/MLE/CE/AB grey, OLE/IR/RTE amber, IE red), rating colours (newbie #999, amateur #00a900,
expert #2f8ecc, candidate master #a44fbf, master #ffb100, grandmaster #ee0000, target #700), heatmap greens.
Fonts: Bai Jamjuree 600/700 for h1/h2 and the wordmark, IBM Plex Sans for body, IBM Plex Mono for code (self-host
the fonts under `apps/web/public/fonts`, no Google Fonts at runtime). Radius 4 px, pills 999 px. Buttons flat
(accent background, white text), no gradients. Table header `--surface-2` with `--ink`, not near-black. Icons:
Lucide, mapped one-to-one from DMOJ's FontAwesome usage. Dark mode toggle in the user dropdown and on the login
page; `profiles.siteTheme` persists it.

## 10. Content pipeline

`packages/content`: `renderMarkdown(source, preset)` -> sanitized HTML string; presets `problem`, `problem-full`,
`comment`, `self-description`, `blog`, `solution`, `contest`, `flatpage`, `organization-about`, `ticket`, `license`,
`language`, `judge` with DMOJ's allowlists. Pipeline: remark-parse, remark-gfm, `remarkTildeMath` (turns `~...~`
into inline math nodes before remark-math; `$...$` also accepted; `\(...\)` and `\[...\]` and `$$` display),
remark-math, remark-rehype (allowDangerousHtml for presets that allow raw HTML), rehype-raw, rehype-katex,
rehype-sanitize (preset allowlist, KaTeX classes allowed), Shiki (`codehilite` wrapper class, GitHub theme light/dark),
headings demoted by two levels for statements, external links `rel="nofollow"` for user content, tables wrapped in
`.h-scrollable-table`, `[user:name]` and `[ruser:name]` references rendered to user links with rating classes.
`markdownToTypst(source, meta)` produces a Typst document using `cmarker` + `mitex` and the statement template in
`packages/content/typst/statement.typ`; `renderPdf(typstSource, workdir)` spawns the Typst binary.

## 11. Realtime and pages

Public pages are server components that call `fetchQuery` for the initial render and hand the data to a client
component that subscribes with `useQuery` (`ConvexProviderWithAuth` fed by Better Auth's JWT via
`authClient.token()`). Lists use `usePaginatedQuery`. Submission list rows, the submission status page, contest
rankings, the hall scoreboard, ticket lists and judge status are live by subscription; no polling anywhere.

## 12. Jobs and crons

`jobs.ts`: `create(type,args)`, chunked processing via `ctx.scheduler.runAfter`, progress updates, `status(jobId)`
query for the progress bar component. Types: `rejudge`, `rescore`, `rateContest`, `moss` (stub unless MOSS key
configured), `userExport`, `pdf`, `sitemap`. Crons: judge recovery (1 min), judge offline marking (1 min),
stale contest-mode cleanup (5 min), hot problems refresh (15 min).

## 13. Auth details

Better Auth config in `apps/web/src/auth/server.ts`: emailAndPassword with `password.verify` that recognises Django
`pbkdf2_sha256$<iter>$<salt>$<b64>` (Node `crypto.pbkdf2Sync(password, salt, iter, 32, "sha256")`, base64 compare,
constant time) and rewrites the hash in Better Auth's format after a successful legacy login; `!`-prefixed hashes are
unusable; `requireEmailVerification: true` with 7-day activation links; username plugin (regex `^\w+$`, max 30);
twoFactor (TOTP with 1 period tolerance, backup codes count 5); passkey (rpID from `AUTH_RP_ID`); admin (impersonation
superuser-only); apiKey (48-char tokens; scopes); bearer; jwt (RS256, payload `{sub, username, isStaff}`,
issuer `AUTH_ISSUER`). Registration form fields as DMOJ: username, email, password, timezone, preferred language,
organisations (open ones only, max 3), disposable-email blocklist. Login page shows pwned-password warning flow
(HIBP k-anonymity). Email via SES when `SES_*` env is set, else logged to console in dev.

## 14. Local development

`infra/compose.dev.yml` services: `convex-backend` (ghcr.io/get-convex/convex-backend, ports 3210 and 3211,
`INSTANCE_NAME=moj-dev`, `INSTANCE_SECRET`, `CONVEX_CLOUD_ORIGIN=http://127.0.0.1:3210`,
`CONVEX_SITE_ORIGIN=http://127.0.0.1:3211`, Postgres backing store via `POSTGRES_URL`), `convex-dashboard` (6791),
`postgres` (5433 on host; databases `convex` and `moj_auth`), `judge` (built from apps/judge, `cap_add: SYS_PTRACE`,
`cpuset: "0-11,14-31"`, env `MOJ_URL=http://host.docker.internal:3211`, `JUDGE_NAME`, `JUDGE_KEY`, problems volume
`./infra/problems:/problems`). `extra_hosts: host-gateway` everywhere so containers can reach the host.
Root scripts: `npm run dev` (concurrently: `convex dev` against the self-hosted backend and `next dev` on 3000),
`npm run setup` (generates the Convex admin key, writes `.env.local`, runs Drizzle migrations, seeds languages,
nav bar, misc config, an admin user `admin`/`admin` for dev, and a sample problem `aplusb` under `infra/problems`),
`npm test`, `npm run lint`, `npm run typecheck`, `npm run e2e:judge` (submits a solution to `aplusb` and waits for AC).

## 15. Import (tools/import)

Input: a MariaDB logical dump (`mysqldump ... --databases dmoj`). Steps: parse INSERT statements per table into
JSONL (streaming, no MySQL server needed), transform into Convex documents with `legacyId`s and id references
resolved in dependency order (languages, types, groups, licenses, users/profiles, organizations, classes, problems,
translations, clarifications, language limits, solutions, data, cases, contests, contest problems, participations,
submissions, sources, cases, ratings, comments, votes, blog, tickets, nav, misc, flatpages), write Better Auth rows
(user, account with the Django hash verbatim, twoFactor with decrypted TOTP secret and backup codes, passkey rows,
api key legacy hash on the profile), then `convex import --replace` per table. Fernet decryption uses the Django
`SECRET_KEY` (`--secret-key`), deriving the key as django-fernet-fields does (HKDF-SHA256 of the secret key, 32 bytes,
urlsafe base64). Output a report of counts per table and any rows skipped.

## 16. Definition of done for the whole build

- `npm run setup && npm run dev` brings up the site locally; the judge container connects and `npm run e2e:judge`
  passes with a real AC from the DMOJ judge.
- Every route in section 8 renders with real data; the staff console can create a problem and a contest.
- The import script runs against the club's dump and the imported admin can log in with their old password.
- An ICPC contest with a 60-minute freeze shows frozen cells and a working reveal on `/contest/[key]/ranking/`
  and `/scoreboard/[event]`.
- `npm run typecheck`, `npm run lint`, `npm test` pass.

## 17. Judge as a git subtree

`apps/judge/judge-server/` is a git subtree of `git@github.com:MonashAPS/judge-server.git` branch `v2`
(`git subtree add --prefix apps/judge/judge-server <url> v2 --squash`). Our changes live inside the subtree so they
can be pushed back upstream with `git subtree push`. Keep the diff minimal: a new `dmoj/moj_packet.py`, a small hook in
`dmoj/judge.py` / `dmoj/__main__.py` that selects it when `MOJ_URL` is set, and nothing else. `apps/judge/README.md`
explains how the judge works (sandbox, executors, problem format, the pull protocol, running it on another box).

## 18. Documentation site, README, CI

- `docs/` is a VitePress site deployed to GitHub Pages from `main` by `.github/workflows/pages.yml`. Pages: Quick
  start (copy-paste Docker commands per distro: Ubuntu 22.04/24.04, Debian 12/13, Fedora, Arch, NixOS, plus a
  "judge on a second machine" section), Architecture, Problem format (DMOJ `init.yml` compatibility, statement
  conventions, `config.json`), Problem repos and CI (the problems API and `upload-problem.mjs`), Importing from
  DMOJ, Contests (formats, freeze, hall scoreboard, ratings), Staff console, API (v2 and problems API), Accounts and
  2FA, Development, Deployment (compose.prod, Caddy, backups), Troubleshooting.
- `README.md` at the root: a screenshot of the home page at the top, then a short description, a link to the docs
  site quick start, then feature sections each with a screenshot in the manner of DMOJ's README (problem statement,
  submit page, live submission status, submission lists, contest system and ranking, hall scoreboard with freeze,
  staff console, accounts/2FA), then DMOJ compatibility (same URLs, same problem format, import of users, problems,
  submissions, contests), supported languages (whatever the judge image tier provides), and how to contribute.
  Plain prose, no em dashes, no marketing tone, no emoji. Screenshots live in `docs/public/screenshots/`.
- `.github/workflows/ci.yml` runs on pull requests and pushes: npm ci, biome, typecheck, vitest, web build, judge
  image build (tier1) and the judge mock end-to-end (`apps/judge/tests`), and a Playwright smoke against a compose
  stack when `RUN_E2E` is set. `pages.yml` builds and deploys `docs/` on push to `main`.

## 19. Seeding from production

`infra/scripts/pull-production.sh` (not run in CI) pulls a fresh logical dump from the current MAPS web box, the
site media directory (statement images) and the problem data directory from the judge box into gitignored local
paths (`tools/import/dump-<date>.sql.gz`, `infra/media/`, `infra/problems/`), then `npm run import` loads them into
the local Convex and Postgres. The Django `SECRET_KEY` needed for TOTP decryption is read from the box into
`tools/import/secrets.env` (gitignored).

## 20. Navigation and search improvements (club feedback, 2026-09-10)

DMOJ's layout stays, but two things members asked for are added on top:

Contest navigation. When the viewer is in contest mode, or is looking at any page that belongs to a contest
(`/contest/[key]/...`, or `/problem/[code]` where the problem is in the viewer's current contest), a second bar
renders directly under the main nav (`ContestBar`, 36 px, surface colour, sticky with the nav): contest name
linking to `/contest/[key]`, then one chip per problem with its label (A, B, C ...) coloured by the viewer's state
(solved, attempted, untouched), then links Standings, Submissions (mine), Clarifications (when enabled), and the live
countdown. On a problem page inside a contest the title row shows a breadcrumb "Contest name / A. Problem name" and
previous/next problem links at the end of the statement. The floater box from DMOJ remains for pages outside the
contest (e.g. the user's profile) but is hidden when the ContestBar is visible. Everything is keyboard reachable.

Search. `/problems/` gets a real filter panel (state kept in the URL query so links are shareable): text search
(name, code, statement), Status (all / solved / attempted / unsolved, relative to the viewer), Solved by (one or more
usernames, with the modifier "and not by me" which is the case members asked for), Types (multi), Group, Points range,
Author, Show editorial-only, Sort (code, name, points, AC rate, users, date). The user page `/user/[user]/solved`
gains a "Compare with me" toggle that lists problems that user solved and the viewer has not. A global command
palette (Ctrl+K or `/`) searches problems, users, contests and organisations from any page, with recent items, and
navigates on Enter; it uses the Convex search indexes. Users list gets a username search box that jumps to the page
containing the user, as DMOJ's `/users/find` does.

Problem observability. Problems record every contest they appeared in (from `contestProblems`), and the problem
page shows an "Appeared in" line under the info box: contest name, the label it had there (e.g. "C"), the date, and
a link to that contest's ranking page. The `/problems/` filter panel gets a Contest filter (pick one or more contests
to list their problems, grouped by contest with the contest name as a group header when the filter is active) and a
"Group by contest" view toggle. The problem page also shows a small stats strip (solvers, attempts, AC rate,
best solve time, fastest solver) and a per-language breakdown on `/problem/[code]/rank/`. Contest pages list their
problems with each problem's public solve count.

Contest problem states. On every contest page (`/contest/[key]`, including past contests), the problem table marks
each problem with the viewer's state: solved (full marks on any submission, in or out of the contest), partially
solved, attempted, or untouched, using the same icons and colours as the problem list, and shows the viewer's
best score. The same state colours drive the ContestBar chips. Past contests additionally show "solved during the
contest" separately from "solved since", so members can see what they cleaned up afterwards.

## 21. Copy rules for the product

No developer, setup or placeholder text anywhere a member can see it. Empty states use product copy in DMOJ's
voice ("No judges are online.", "No submissions yet.", "This contest has no problems."), never commands, file
paths, TODOs or "coming soon". Operational hints for staff belong only inside `/admin`. No emoji. Page titles,
labels and buttons use DMOJ's wording where DMOJ has one. Error pages match DMOJ's (404 "Page not found", 403
"Access denied", 500 "Internal error") without stack traces.
