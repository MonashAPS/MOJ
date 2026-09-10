# Page requirements from the parity audit

Items the backend already supports and no page renders yet. Each says the route, the
field to read, the DMOJ behaviour to reproduce, and a code or key from the real
import to test with.

The backend work is done unless a line says otherwise: the Convex query named in each
item already returns the field.

---

## Problems

### P1 — Pass the viewer's language to `problems.get`

- **Route** `/problem/[code]/`
- **Data** `api.problems.get({ code, language })`; the language comes from
  `viewerLanguage()` in `apps/web/src/lib/language.server.ts`.
- **DMOJ** `judge/views/problem.py:187` —
  `problem.translations.get(language=request.LANGUAGE_CODE)`, else the original with
  `translated = False`. Exact match only: no `es-MX` → `es` fallback. The response
  already carries `statement.{name, source, translated, language, preset}`; render
  `statement.name` as the page title, not `problem.name`.
- **Test with** `halftheproblem`. With no cookie the page must show the 1 044-char
  story titled "Half the problem"; with `moj-language=es` it must show
  "The other half of the problem" and the input/output specification. This problem is
  **unsolvable** without the `es` statement, so it is the parity canary.
- Also `1234567890` (an `es` translation of a stub, problem not public).

### P2 — Statement images

- **Route** `/problem/[code]/`
- **Data** rendered HTML from `@moj/content`.
- **DMOJ** statements reference uploads as `/media/martor/<uuid>.png`. The route that
  serves them now exists (`apps/web/src/app/media/[...path]/route.ts`); the page just
  has to not rewrite or strip the `src`. Do **not** pass `baseUrl` to `renderMarkdown`
  for the HTML page — that is DMOJ's `absolute_links`, for print only.
- **Test with** `ttc`, `tiltedtowers` (three images), `primecut` (two), `crossingsails`
  (one markdown, one raw `<img>`).

### P3 — Show the allowed-language list only when it is a subset

- **Route** `/problem/[code]/`
- **Data** `showLanguages` on the `problems.get` payload.
- **DMOJ** `views/problem.py:169` —
  `allowed_languages.count() != Language.objects.count()`. When false, DMOJ prints no
  language list at all.
- **Test with** `1234567890` (only `CPP20`; must show the list) against any other
  problem (all 59; must not).

### P4 — Per-language limits table

- **Route** `/problem/[code]/`
- **Data** `languageLimits: [{ languageKey, languageName, timeLimit, memoryLimit }]`.
- **DMOJ** renders one row per `LanguageLimit`, overriding the problem's own limits
  for those languages in the info box.
- **Test with** any of the 120 problems that have them, e.g. `bugatti`, `editdistance`,
  `formula`.

### P5 — Editorial visibility

- **Route** `/problem/[code]/editorial/`
- **Data** `solutions` row (`isPublic`, `publishOn`, `authorProfileIds`) and
  `solutionIsAccessibleBy` from `@moj/core`.
- **DMOJ** `Solution.is_accessible_by`: visible when `is_public` **and**
  `publish_on <= now`, otherwise only to someone who can edit the problem. A hidden
  editorial 404s rather than showing an empty page.
- **Test with** the four private ones: `goatiii`, `factorfusion`, `tasksanddeadlines`,
  `suffering`. Nothing in the data is future-scheduled, so build a fixture for that
  branch.

### P6 — Clarifications

- **Route** `/problem/[code]/`
- **Data** `api.problems.clarifications`.
- **DMOJ** shows them newest first above the statement, only while the viewer is in a
  contest that contains the problem and the contest has `use_clarifications`.
- **Test with** `gidiup` (the only clarification in the data).

### P7 — Ticket badge and list

- **Route** `/problem/[code]/`, `/ticket/`, `/problem/[code]/tickets/`
- **Data** `api.tickets.*`; `linkedType: "problem"` and `linkedKey` is the problem code.
- **DMOJ** `views/problem.py:177` — the badge shows the count of tickets the viewer
  may see (their own, unless they can edit the problem), and `num_open_tickets`
  separately.
- **Test with** `pondoexponentiation` (three tickets), `methodicalrocket` (two). Two of
  the twelve are still open.

### P8 — Comments on problems and editorials

- **Route** `/problem/[code]/`, `/problem/[code]/editorial/`
- **Data** `api.comments.list({ targetType: "problem" | "solution", targetKey: code })`.
- **DMOJ** roots newest first, replies oldest first within a thread; a comment at or
  below the vote-hide threshold is collapsed; hidden comments are dropped for
  everyone except moderators (MOJ keeps them visible to moderators so the hide can be
  undone — see `docs/SPEC_CHANGES.md`).
- **Test with** `distanceduel` (two comments), `blockpathing`, `gidiup`.

---

## Contests

### C1 — Window contests: join, countdown and ranking

- **Route** `/contest/[key]/`, the contest bar, `/contest/[key]/ranking/`
- **Data** `contests.get` returns `timeLimit`, and `participation.endsAt`, `.ended`,
  `.timeRemaining` are already computed from it.
- **DMOJ** `ContestParticipation.end_time` (`contest.py:566`):
  - spectating → the contest end;
  - virtual → `real_start + time_limit`, or `real_start + (end - start)` when there is
    no limit;
  - live → the contest end when `time_limit is None`, otherwise
    `min(real_start + time_limit, contest.end_time)`.
  The countdown must be against the *participation's* end, not the contest's, and the
  ranking's "time" column starts from `ContestParticipation.start`, which for a window
  contest is `real_start`, not `contest.start_time`.
- **Test with** `tehran2024`: `time_limit` 18 000 s (5 h) inside a nine-day window,
  with one `virtual = 1` participation. Joining it live near the end of the window
  must clamp to the contest end, and joining after it must produce a fresh 5-hour
  virtual window.
- **Backend gap:** `convex/contestRankings.ranking` does not return `timeLimit` in its
  contest block. A ranking page that shows remaining time needs it added there or a
  second `contests.get`.

### C2 — Problem labels

- **Route** `/contest/[key]/`, the contest bar, the ranking header
- **Data** `format.labelScheme` on `contests.get`, or `getContestLabelForProblem` from
  `@moj/core`.
- **DMOJ** with no `problem_label_script`, the format decides: `default` (all 63 of the
  club's contests) numbers its problems **1, 2, 3**; only `icpc` letters them. The
  import used to write `letters` for everything; that is fixed, so a re-imported
  deployment carries `labelScheme: "numbers"`. **Do not hard-code letters.**
- **Test with** any contest, e.g. `2026s2w6` (five problems, must read 1–5).
- Prefer `@moj/core`'s `getContestLabelForProblem` over re-deriving it; there are
  already two other copies of the rule in `convex/`.

### C3 — Scoreboard cells

- **Route** `/contest/[key]/ranking/`
- **Data** `participation.formatData` keyed by the **contest problem's Convex id**, via
  `format.displayUserProblem`.
- **DMOJ** `DefaultContestFormat.display_user_problem`: the cell class is
  `best_solution_state(points, contest_problem.points)`, prefixed `pretest-` when the
  contest is pretests-only and the problem is pretested; the cell shows the points
  over a `HH:MM:SS` solving time. An absent entry renders an empty `<td>`, not a zero.
- **Test with** `2026s2w6` — the first participation has five cells. If cells render
  blank for imported participations, the deployment predates the format-data rekey:
  run `npx convex run importer:backfillFormatDataKeys '{"cursor": null}'` in a loop
  until `isDone`.

### C4 — Hidden problem tags

- **Route** `/problem/[code]/` while in a contest, `/contest/[key]/`
- **Data** `types: null` from `problems.get`, and `hideProblemTags` on `contests.get`.
- **DMOJ** inside a contest with `hide_problem_tags`, the type list is not rendered at
  all — not rendered empty.
- **Test with** `2023dsless`, `2024s1beginner`, `mcpc24`.

### C5 — Scoreboard visibility

- **Route** `/contest/[key]/ranking/`
- **Data** `viewer.canSeeScoreboard`, `.canSeeFullScoreboard`, `.canSeeOwnScoreboard`
  on `contests.get`; `contestRankings.ranking` returns `null` when the viewer may see
  nothing and `canSeeFullScoreboard: false` when they may see only their own row.
- **DMOJ** `V` always; `C` only after the contest ends; `P` after the contest ends or
  once the viewer's own participation has; `H` never, except for editors, testers with
  `tester_see_scoreboard`, spectators after the start, and anyone in
  `view_contest_scoreboard`. Under `P`/`H` a viewer who may see only their own row
  sees other ranks as `???`.
- **Test with** — no contest in the data is anything but `V`, so build fixtures. The
  existing coverage is `convex/__tests__/contestsRanking.test.ts`.

### C6 — Access code prompt

- **Route** `/contest/[key]/join/`
- **Data** `viewer.requiresAccessCode` on `contests.get`; `contests.join({ key,
  accessCode })` throws `ConvexError` with `reason: "accessCodeRequired"`.
- **DMOJ** the code is demanded only when a *new* participation would be created —
  resuming an existing one never asks — and editors skip it. The code itself is never
  sent to the client.
- **Test with** — no contest has one; build a fixture.

### C7 — Testers, spectators, curators and banned users

- **Route** `/contest/[key]/`
- **Data** `viewer.isEditor`, `.isTester`, `.isSpectator`, `.isBanned`, `.canJoinLive`,
  `.canSpectate`, `.canJoinVirtual`.
- **DMOJ** editors and testers may *not* join live but may always spectate; a banned
  user cannot join at all; a spectator's participation runs to the contest end.
- **Test with** `2023mcpc` (3 testers, both `tester_see_*` on), `2026beginner`
  (11 testers, neither), `2025s1beginner` (1 spectator, 5 curators), `2025s1w9`
  (1 banned user and the only disqualified participation).

### C8 — Disqualified participations

- **Route** `/contest/[key]/ranking/`
- **Data** `isDisqualified` on the participation; its stored `score` is `-9999`.
- **DMOJ** shows the row struck through at the bottom, not hidden, and never lets the
  `-9999` reach the display as a number.
- **Test with** `2025s1w9`.

### C9 — Locked contests

- **Route** the submission page and any rejudge control
- **Data** `submission.lockedAfter`, `isLocked` from `@moj/core`.
- **DMOJ** a locked submission cannot be rejudged or edited by anyone but a superuser.
  Note that only submissions made *after* the lock was configured carry the field.
- **Test with** `2024s1w7` (25 of 33 submissions locked), `geointro2025` (19 of 22).

### C10 — Contest clarifications

- **Route** `/contest/[key]/`
- **Data** `api.contests.clarifications`, `api.contests.addClarification`.
- **DMOJ** the form is shown only when `use_clarifications` is set (60 of 63 contests)
  and the viewer is an author or curator.

---

## Users and community

### U1 — Display rank, mute and unlisted

- **Route** `/user/[username]/`, `/users/`, comment threads
- **Data** `displayRank`, `mute`, `isUnlisted` on every profile payload.
- **DMOJ** `Profile.get_user_css_class(display_rank, rating)` → `rating <rate-class>
  <display_rank>`; use `getUserCssClass` from `@moj/core`, do not rebuild the string.
  An unlisted user is absent from `/users/` and from every ranking (the backend already
  excludes them, so the page must not add its own listing that bypasses the index).
  A muted user's comment box must render read-only rather than erroring on submit —
  `comments.list` returns `isMuted` for exactly this.
- **Test with** — the import has no muted or unlisted user and one `admin`
  `display_rank` (the seeded account), so this needs fixtures. `convex/tests/` has
  helpers.

### U2 — Comments with a dead target

- **Route** `/contest/[key]/`
- **Data** `comments.list` returns `null` when the target no longer exists.
- **DMOJ** the page simply does not exist. Two comments in the import point at contest
  key `beginner24`, which was deleted on the old site; nothing should crash or render
  a half page for them. Do not "repair" them — the data is faithful.

### U3 — Tickets

- **Route** `/ticket/`, `/ticket/[id]/`
- **Data** `api.tickets.list` / `.detail`; `linkedTitle` and `linkedHref` are already
  on the summary.
- **DMOJ** a ticket is visible to its author, to anyone with `change_ticket`, and to
  anyone who can edit the linked problem. New tickets on a problem inside a contest are
  assigned to the *contest's* authors, not the problem's — already implemented in
  `convex/tickets.ts:315`.
- **Test with** the 12 imported tickets, 2 of which are open.

---

## Site chrome

### S1 — Navigation bar regexes

- **Route** every page
- **Data** `nav[].regex` from `api.site.shell`.
- **DMOJ** the active tab is chosen by matching the request path against the item's
  regex, not by a prefix compare on `path`. Two of the six imported items rely on it:
  `submit` is `^/submi|^/src/` (so `/src/123` highlights Submissions) and `status` is
  `^/status/$|^/judge/` (so a judge page highlights Status).
- **Nesting**: `status` is a *child* of `about` — the only nested item. The nav has to
  render one level of children or the Status link disappears.

### S2 — Language switcher

- **Route** the footer, every page
- **Data** `SITE_LANGUAGES` and the `moj-language` cookie
  (`apps/web/src/lib/language.ts`).
- Already wired: the layout reads the cookie, passes it to the shell and to
  `<html lang>`. A page that renders a statement must pass that same value to
  `problems.get`. There are no message catalogues, so nothing else on the page
  changes — that is expected, and matches what the club's data needs.

### S3 — Flat pages and misc config

- **Route** `/about/` and any other flat page
- **Data** `api.site.flatPage`, `api.site.shell`'s `misc`.
- The import brought over neither (both tables are empty upstream); the deployment's
  `/about/` page and five misc keys are MOJ seed values. Nothing to reproduce, but the
  page must keep 404ing for an unknown flat-page URL rather than rendering an empty
  shell.
