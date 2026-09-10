# Spec changes

Append dated bullets when you had to extend or deviate from docs/SPEC.md.

## 2026-09-11, submission, judge and statistics pages

- `submissions.list` truncated its page at `numItems` while returning the cursor for the end of the whole scan it
  had walked, so every row between the cut and the cursor was unreachable: a problem with 174 submissions only
  ever offered the first 50. The page is now the scan minus what the viewer may not see, which is what the
  function's own docstring already promised, and `PAGE_SCAN_MULTIPLIER` is 2 so a page stays a sensible length.
  `convex/__tests__/submissionsListPaging.test.ts` walks every page and fails without the fix.
- `packages/protocol/src/index.ts` re-exported with `.js` specifiers. Turbopack does not rewrite a `.js` specifier
  to the `.ts` file beside it, so `next build` could not resolve `API_VERSION` and the whole app failed to build.
  The barrel is extensionless now. **`@moj/core` has the same problem and still has it**: its barrel and every
  internal import carry `.js`, so `import { hasPerm } from "@moj/core"` fails inside `apps/web`. Subpaths whose
  file has no runtime imports (`@moj/core/verdicts`, `@moj/core/util/number`) do resolve, and `apps/web` adds
  `@moj/core` to `transpilePackages` so they compile; `apps/web/src/lib/viewerPerms.ts` carries copies of
  `isStaff` and `hasPerm` because `@moj/core/permissions` cannot be reached at all. Dropping the extensions
  across that package removes the workaround.
- `apps/web` still cannot `next build`: `packages/content/dist/typst/render-pdf.js` locates its templates with
  `new URL("../../typst/", import.meta.url)`, which Turbopack tries to resolve as a module, and
  `/problem/[code]/pdf` pulls it in. `serverExternalPackages` does not help because the package is a workspace
  symlink. Every other route builds; this one belongs to whoever owns the content package.
- DESIGN.md section 15 asks the status page for a "12 / 18 cases" progress bar. A judge streams its cases as it
  runs them and never says how many there are, so there is no honest denominator: the bar pulses at full width
  while `P`/`G` with the case the judge is on beside it in mono, and a queued submission gets the words alone.
- The submission row's stretched link points at the submission, not at the problem as section 12.2 says; the
  problem name is a separate link above it. A submission list's row is about the submission, and DMOJ's own row
  carries a "view" link for exactly that.
- The statistics side box is left off `/submissions/user/<u>/` and the contest lists.
  `submissions.resultsForProblem` counts globally or for one problem, and DMOJ's `_get_result_data` counts the
  list's own queryset, so showing it there would report a total that is not the list's.
- New page queries, for the integrator to deploy: `convex/pages/submissions.ts` exports `listContext` (the filter
  panel's options, DMOJ's `get_searchable_status_codes`, and the `access_check` each list runs), `statusExtras`
  (the judge a submission ran on, the language's time-limit override, the maximum single-case runtime, a contest
  problem's output-prefix clip and the abort/rejudge/resubmit flags) and `sourceView` (the source plus the Shiki
  grammar for the language). Until they are deployed the pages fall back to composing the same shape from
  `viewer.current`, `languages.list`, `profiles.byUsername`, `problems.get`, `contests.get`,
  `submissions.detail` and `submissions.source`; the fallback loses the judge name, the language time-limit
  override and the output-prefix clip, and nothing else.
- `verdictTone` in `@moj/ui` did not know `_AC`, the code `Submission.result_class_from_code` produces for an
  accept that did not take every point, so a partial accept was drawn as a neutral pill. It is in the `warn`
  family now, as section 2.3 lists it, and the pill still reads `AC`.
## 2026-09-11, contest pages

- New page-level Convex module `convex/pages/contests.ts`, holding what the contest routes need on top of
  `contests.ts` and `contestRankings.ts` and nothing else:
  - `tag({name})` — `/contests/tag/[name]`'s own header. `ContestTagDetail` renders the tag chip and its
    description, and neither is reachable from `contests.list`'s rows when no contest carries the tag.
    `tagTextColor` is `ContestTag.text_color`'s luma rule.
  - `frozenCells({key})` — SPEC section 7. `contestRankings.ranking` scores a frozen board from pre-freeze
    submissions, which is right for the ranking but leaves a post-freeze solve indistinguishable from an
    untouched problem. This returns, per cell, the *count* of submissions the freeze is withholding (never a
    verdict), so a frozen cell can render as `?` with its attempt count as the spec asks. Returns null whenever
    the board is not frozen for the viewer.
  - `deleteMossResults({key})` — `ContestMossDelete` (contests.py:880). `convex/contests.ts` has the `moss`
    query but no delete, and `/contest/[key]/moss` needs the button.
  Each page calls these defensively (the server probes, and the browser only subscribes when the probe
  succeeded), so a deployment that has not taken them yet degrades instead of erroring.
- `TitleRow`'s inner row gained `min-w-0` and `PageTabs` gained `min-w-0 max-w-full`
  (`packages/ui/src/components/title-row.tsx`). Without them the row's grid track takes the tab strip's
  max-content width and every page with more than three tabs scrolls sideways at 375 px, which fails DESIGN.md
  section 24's checks 22 and 39. One line each, no visual change above 768 px.
- `apps/web/src/proxy.ts` skips its trailing-slash redirect for `/_next`. `/_next/hmr` is a websocket upgrade
  and the 308 to `/_next/hmr/` fails the handshake, which leaves the Turbopack dev runtime unable to hydrate
  any page. (The dev server must also be opened on the same host the `allowedDevOrigins` check expects —
  `localhost`, not `127.0.0.1` — or Next rejects the same socket on the Origin header.)
- `viewer.current`'s `contestModeStale` is cleared by `ProfileBootstrap`, which already subscribes to that
  query for the profile bootstrap; it runs `contests.clearStaleContest` once per page load when the flag is set.
- The ContestBar takes the contest from the URL on a `/contest/[key]/...` route (`contests.navBar({key})`)
  rather than only from the viewer's own participation, so it renders on every contest route as section 20
  requires. It also stops counting down when the window has closed ("ended") or when the contest runs past
  `COUNTDOWN_HORIZON` ("open"), because DMOJ's tutorial contests end in the year 9999.
- `contestRankings.ranking` does not carry `timeLimit`, as the parity audit notes. The ranking page reads
  `contests.get` for the contest's window and the viewer's participation end instead of duplicating the module.
## 2026-09-11, staff console part 2

Routes added under `/admin`: `/admin/` (the section index), `users`, `users/[username]`, `organizations`,
`organizations/[slug]`, `classes`, `judges`, `languages`, `navigation`, `config`, `config/branding`,
`flatpages`, `blog`, `licenses`, `tags`, `tickets`, `api-keys`. The pages live in the `(part2)` route group; the group carries its
own `error.tsx` so a refused subscription shows a panel inside the console instead of the site's 500.

- New Convex module `convex/pages/admin2.ts`, covered by `convex/tests/pagesAdmin2.test.ts`: `revisions`
  (the generic history panel), `userExtras` and `setUserMemberships` (the profile fields `admin/users.edit`
  does not carry — `about`, `usernameDisplayOverride`, the preferred-language foreign key and organisation
  membership with its denormalised count), `clearLegacyApiToken`, and `myApiKeys` / `recordApiKey` /
  `revokeApiKey` for the `apiKeys` table. `convex/_generated/api.d.ts` was hand-extended with `pages/admin2`,
  as the other branches do. **It is not deployed on the shared dev backend**, so in this worktree the pages
  that read it fall back (`userExtras` is fetched server-side with a catch, the API-key mirror reports a
  warning); the integrator has to deploy it.
- API keys: Better Auth's api-key plugin treats `permissions` as a server-only property and rejects the call
  when request headers are present, so `createApiKey` is invoked with an explicit `userId` after the server
  action has checked the session itself. The key is minted there, then its sha256 hex, its visible prefix
  (the plugin's `start`, 6 characters) and its wire scopes are mirrored into the `apiKeys` Convex table, which
  is the fallback `http/problemsApi` verifies against. The two rows are correlated by that prefix, because the
  table has no column for Better Auth's key id. The page documents `NEXT_PUBLIC_CONVEX_SITE_URL` as the
  problems API base: the endpoint is a Convex HTTP action, not a Next route, so `JUDGE_URL` in a problem
  repository's workflow is the Convex site origin, not the site members browse.
- Impersonation is `auth.api.impersonateUser` from a server action, with the returned `Set-Cookie` headers
  copied onto Next's cookie store by hand (the `nextCookies` plugin is not installed). `/impersonate/stop/`
  is added as a route handler because the user dropdown already links to it, and the root layout now passes
  `isImpersonating` (from `session.impersonatedBy`) into the shell so that row appears.
- "Reset 2FA" deletes the account's `two_factor` rows through Drizzle and clears `user.two_factor_enabled`;
  Better Auth's admin plugin has no endpoint for removing another account's factors. Sessions are revoked with
  it, so the member re-enrols on the next sign-in. Deactivating an account is `admin/users.deactivate` for the
  profile plus `auth.api.banUser` for the account, in that order.
- DMOJ lets only an organisation's own admins (or a class admin) review its join requests — `can_review_all_requests`
  does not consult `is_superuser` — so `organizations.reviewRequests` refuses a superuser who is not an admin
  of that organisation. The tab is wrapped in a small error boundary that says so rather than taking the page
  down; the rule itself is left alone.
- The users list's "Superusers" filter asks `admin/users.list` for the staff page (`perPage` 200) and refines
  client-side, because that query has no `isSuperuser` argument. Staff are few enough that one page covers them.
- Organisation and class administrators, and class members, are comma-separated username fields: the mutations
  take usernames, and the kit has no combobox that searches the server as you type. A bad username comes back
  from the backend as `User <name> not found`.
- A blog post's publish time is a plain text field in `YYYY-MM-DD HH:MM`, because DESIGN.md forbids
  `input[type=date]` and the kit has no date picker.
- `packages/ui`'s `Breadcrumb items={...}` shortcut renders `BreadcrumbSeparator` (an `<li>`) inside
  `BreadcrumbItem` (also an `<li>`), which React rejects at hydration. The console composes the parts as
  siblings in its own `Crumbs` helper; the kit's shortcut should be fixed the same way.
- DESIGN.md's checklist item 23 ("no native select or checkbox in the DOM") cannot pass for any page with a
  form: Radix's `Select` and `Checkbox` render a hidden native control for form participation whenever they
  sit inside a `<form>`. Every visible control is still the kit's.
- At 390 px an authenticated console page's document scrolls horizontally even though the dense table itself
  scrolls inside its own wrapper. Only `overflow-x: clip` on `main` or on `.enter-rise` in `SiteShell` contains
  it — clipping anywhere inside the console subtree does not — so the fix belongs to the shell, and it will
  affect part 1's tables and the public dense lists too. The console's own boxes carry `min-w-0` already.
- The shell components (`AdminShell`, `AdminTable`, `AdminForm`, `RevisionsPanel`, `JobProgress`, plus
  `sections.ts`) are minimal versions written here so the pages could be built; part 1 owns the canonical set.
  The props these pages rely on are: `AdminShell({children})`; `AdminTable({columns, rows, rowKey, toolbar,
  loading, emptyTitle, emptyDescription, emptyAction, footer, caption})` where a column is
  `{key, header, numeric?, className?, cell(row)}`; `AdminForm({children, onSubmit, reason, onReasonChange,
  reasonLabel?, reasonHint?, dirty, busy, submitLabel, error, saved, actions?})`;
  `RevisionsPanel({rows, title?, emptyText?})`; `JobProgress({jobId, onDismiss?})`. `/admin/page.tsx` (the
  section index) is also written here; drop it if part 1 has one.
- Branding (SPEC section 24) is implemented here: `siteSettings` gains `logoStorageId`, `faviconStorageId`,
  `accentColor`, `navColor`, `customCss` and `themeDefault`, all optional, so an unset field falls back to
  `packages/ui/src/tokens.css`. The public query is `site.branding`; it resolves the storage URLs and computes
  the dark-mode derivatives server-side (the accent is mixed 45% towards white, the nav is kept and the dark
  titlebar lifted slightly, the way the token file does it) so the same pair reaches the server render and any
  client. The mutations are `pages/admin2.updateBranding` and `generateBrandingUploadUrl`, superusers only,
  with a revision. Replacing an upload deletes the old blob.
  - `apps/web/src/lib/branding.ts` builds the `:root` override block (`--accent`, `--nav`, `--titlebar`,
    `--brand-royal`, plus the `prefers-color-scheme` and `[data-theme="dark"]` variants) and appends the custom
    CSS last; `BrandingStyle` emits it from the root layout's `<head>`. Every stored value is stripped of the
    characters that could close the element or start a rule; `apps/web/src/lib/branding.test.ts` covers that.
  - The nav takes an uploaded wordmark through `NavBar`'s `src`. The auth pages draw the bundled SVG from
    `components/auth/AuthCard.tsx`, which is rendered from client components and so cannot read the branding;
    until that component takes a prop, the emitted CSS replaces it with `content: url(...)` on
    `svg[aria-label="MAPS Online Judge"]`.
  - `ThemeScript` now takes the operator's default theme and applies it when the visitor has nothing stored;
    "system" keeps the previous behaviour of leaving `data-theme` off.
  - `generateMetadata` in the root layout reads the branding for the title template and the favicon.
  - `seed.run` takes `siteName` / `siteLongName`, and `infra/scripts/setup.mjs` passes `MOJ_SITE_NAME` /
    `MOJ_SITE_LONG_NAME` through when they are set. An existing settings document is only renamed under `force`.
  - The logo and favicon pickers are a `sr-only` `input[type=file]` driven by a kit `Button`. DESIGN.md forbids
    a native file input, and the kit has no replacement; the visible control is still the kit's, and there is no
    other way to open a file dialog.

- Two findings outside this branch's scope, both of which break `next build` (dev and `tsc` are fine):
  `@moj/protocol` ships raw TypeScript with `./apiV2.js`-style specifiers inside `src/index.ts`, which
  Turbopack cannot resolve because the package has no build step; the extensions are dropped here (the repo is
  on `moduleResolution: Bundler`), and the owner may prefer to give the package a `dist` instead. The remaining
  error is `@moj/content`'s `new URL("../../typst/", import.meta.url)` in `render-pdf.ts`: Turbopack traces it
  statically and fails on the directory. A `turbopackIgnore` comment does not help; either resolve the tree
  from `process.cwd()` at runtime or add `@moj/content` to `serverExternalPackages` in `apps/web/next.config.ts`.
  That one is left for its owner.

- Staff two-factor is enforced by `apps/web/src/proxy.ts` for every page including `/admin`, so a staff account
  without a factor cannot reach the console at all. Screenshots of this branch were taken with a temporary
  local escape hatch that was reverted; whoever reviews the console needs an enrolled account, or the gate has
  to learn about a development flag.

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


## 2026-09-10, packages/ui and the shell

- `packages/ui` is now the real component kit, ported from the shadcn/Radix kit in
  `OrderRegistration` and restyled onto `tokens.css`. Three notes on the port:
  - **Tailwind v4 does not accept DESIGN.md's `h-[--control-h]` spelling.** In v4 a bare
    `--var` inside square brackets is emitted verbatim (`height: --control-h`), which is invalid
    CSS and silently does nothing; the token has to be written `h-(--control-h)`. Every recipe in
    DESIGN.md section 11.4 that uses the bracket form has been translated to the parentheses form
    or to a theme name. Section 11.4 should be corrected when it is next edited.
  - **Tailwind's type scale is replaced rather than extended**, in `theme.css`: `text-xs` 11,
    `text-sm` 12.5, `text-base` 14, `text-md` 16. A ported class string therefore lands on MOJ's
    ladder without being rewritten. The one place 16px is wanted on purpose — an input on a phone,
    so iOS does not zoom on focus — writes `text-[16px] md:text-base`.
  - Where shadcn's name for a primitive collided with the name the foundation exported for a
    convenience wrapper, the wrapper kept the short name and the Radix root took a `Root` suffix:
    `SelectRoot`, `TabsRoot`, `TooltipRoot`, `BreadcrumbRoot`, `PaginationRoot`. `Toggle` is still
    a labelled `Switch`; shadcn's pressed-state button is `ToggleButton`. Everything the foundation
    exported still resolves with the same call signature. `packages/ui/README.md` is the reference.
- `tokens.css` gained one scope, `[data-chrome="dark"]`. The nav and the ContestBar are dark in
  both themes, so rating names, problem-state chips and the countdown drawn on them always need the
  dark values whatever the page theme is (DESIGN.md sections 8.1 and 9); marking the chrome
  re-points `--v-*`, `--state-*`, `--rating-*` and `--accent-ink` without re-declaring a theme.
- **DESIGN.md's reviewer checklist item 23 cannot be satisfied literally.** Radix's `Select`
  renders an `aria-hidden`, `tabindex="-1"` native `<select>` whenever its trigger is inside a
  `<form>`, so that the control participates in native form submission; there is no prop to turn it
  off. No native control is visible or focusable anywhere in the product, but the check has to read
  `document.querySelectorAll('select:not([aria-hidden]), input[type=checkbox], …')`.
- The chrome publishes `--header-height` from a `ResizeObserver` on the fixed header (nav + keyline
  + ContestBar) and derives `--sticky-top` from it, so a sticky table header never has to guess
  which bars are on screen (DESIGN.md section 12).
- `apps/web/src/proxy.ts`'s trailing-slash redirect built its target with `request.nextUrl.clone()`.
  `NextURL` re-applies the `trailingSlash` config when it serialises, so the redirect pointed back
  at the path it came from and any extensionless 404 (`/nope`) looped until the browser gave up.
  It now builds a plain `URL` from `request.url`.
- `apps/web/src/lib/simple-markdown.tsx` is gone, replaced by `apps/web/src/lib/markdown.ts`:
  `renderContent(source, preset)` and `renderFlatPage(source)`, both `async`, both wrapped in
  React's request `cache`, both server-only. `@moj/content/styles/content.css` and
  `katex/dist/katex.min.css` are imported from `globals.css`, and `content.css` is the authority for
  `.content-description`; `packages/ui/src/skin.css` deliberately does not duplicate it.
- `@moj/content` resolves to `dist/`, which is gitignored, so the root `package.json` gained a
  `prepare` script that builds it. `npm ci` runs `prepare`, which is what keeps CI's typecheck and
  build green without reordering the workspace build.
- `convex/lib/auth.ts`'s `hasPerm`/`isStaff` now delegate to `@moj/core`, with the profile document
  handed over as a `ProfileRow` (its `_id` republished as `id`). One behaviour change comes with
  that: DMOJ's `is_staff` is `user.is_staff` alone, where the foundation's helper also returned true
  for a superuser. Every superuser the seed and the importer create is also staff, so nothing in the
  product changes, but a hand-made superuser without the staff flag would now fail `requireStaff`.
- `packages/ui/src/controls.css` is deleted; its contents live in the components.
- Three more notes on the shell, all from review:
  - The nav's logo cell is the full 44 px with the wordmark at 30 px (26 px under the mobile
    breakpoint), 12 px either side and no plate, which is the proportion the DMOJ fork uses.
    Above an auth card the same mark is an inline SVG (`apps/web/src/components/Wordmark.tsx`)
    drawn in `currentColor` through a mask, so it takes a new token, `--wordmark-ink` — MAPS navy
    on light, the club's bone on dark — rather than needing a dark plate behind it.
  - The light/dark switch has exactly one home: the user dropdown when signed in, and a ghost icon
    button beside "Log in" when signed out. DESIGN.md section 18 puts one on the auth pages as
    well; two homes for one control is worse than the spec's convenience, so the auth card no
    longer carries it.
  - `DropdownMenu` defaults to `modal={false}`. A modal Radix menu leaves `pointer-events: none`
    on the body long enough that a dialog opened straight after it (the user menu, then Ctrl+K)
    comes up under the menu's dismissable layer and stops answering Escape.
  - The user dropdown adds **My profile** above **Edit profile**. DMOJ's own nav makes the username
    itself the link to the profile and opens the menu on hover; MOJ's username is the menu trigger,
    so without this row there is no way to reach your own profile from the chrome.
- Two design overrides from review, applied to `tokens.css` and written back into DESIGN.md and HOME.md:
  - `--bg-2`, the page ground, is plain white in light mode, not the bone off-white. Panels, cards and
    tables are white too and are separated from the ground by their hairline and their titlebar rather
    than by a tint. Dark mode keeps its navy-tinted ground.
  - Panel titlebars and table header bands are the club's navy, on a new `--titlebar` /
    `--titlebar-ink` / `--titlebar-ink-2` / `--titlebar-line` set (`#101A3D` on light, `#1E2748` on
    dark so the band still lifts off `--surface`), rather than `--surface-2`. That is DMOJ's dark
    header band in our own colour, and it is the same hue on a home side box, on a sample case, on the
    contest floater and on a list page's table. `--surface-2` keeps the wells, chips and segmented
    controls. Statement tables are the exception: `.content-description table.table thead th` is styled
    inside `@moj/content`'s `styles/content.css`, which this branch does not own; that band still reads
    from `--surface-2` and should be pointed at `--titlebar` when the content package is next edited.
- Home side boxes, from the same review: the rows are DMOJ-dense — 14 px text, ~26 px rows, 4 px of
  vertical padding, each list on its own grid so the columns line up (rank / username / points in Top
  users, name / points in New problems, username over target with a short relative time at the right in
  Recent comments), and hairlines as the only dividers. Their links take `--accent` rather than `--link`,
  which reads washed out at that size, and that override also wins over the `--rating-*` colour, so an
  unrated member is not rendered grey in a list of links. DESIGN.md section 12.3 and HOME.md section 4.5
  still put the rating colour on a username, and the ranking pages keep it; the home side boxes do not.
- The footer's club credit must point at <https://monashaps.com>; MOJ is a MAPS site, not a MAC one.
  The value is data, in `miscConfig.footer`, and the dev deployment's row has been corrected. The
  default it was seeded from is still `https://monashcoding.com/` in `convex/seed.ts`'s
  `MISC_CONFIG_DEFAULTS`, which this branch does not own — the one-line change belongs with whoever
  owns that file, otherwise a fresh `npm run setup` puts the wrong link back.


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

## 2026-09-10, packages/content

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
  `jobsContests.sweepContestMode`, which is what `maintenance.cleanupContestMode` should call.
- Contest job runners live in `convex/jobsContests.ts` (`rescoreChunk`, `rateContestJob`,
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
  `siteSettings.mossApiKey` is set, and `jobsContests.mossJob` fails with the same message. Running MOSS needs an
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

## 2026-09-10, integration

Decisions taken when the six backend branches were merged onto `build`. Every one of them changes a name or
a wiring point that the page wave will import, so they are recorded here rather than left to be discovered.

- **`convex/jobs/` is gone.** Convex refuses a file and a directory with the same module name, so `jobs.ts`
  and `jobs/contests.ts` could not both exist. The two directory modules moved up: `convex/jobsContests.ts`
  and `convex/jobsUsers.ts`, and every reference is `internal.jobsContests.*` / `internal.jobsUsers.*`.
- **`jobs.run({jobId})`** is the single entry point a queued `jobs` row is started through, per section 12.
  It reads `type` off the document and schedules the runner that owns it: `rejudge` and `rescore` in
  `jobs.ts` (or, when the args carry a `contestId`, the contest runners), `rescoreContest`, `rateContest`,
  `rejudgeContestProblem` and `moss` in `jobsContests.ts`, `userExport` in `jobsUsers.ts`. `pdf` and
  `sitemap` are marked done with `{skipped: true}`: both are rendered by the web app, and the row only
  exists so the console can show one was asked for. It also accepts `{type, args}` because
  `admin/problems.ts` schedules it by name (`makeFunctionReference("jobs:run")`) and cannot import it.
- `rejudge` job args are resolved rather than assumed: `problemCode` is looked up if `problemId` is absent,
  `languages` (keys) are mapped to `languageIds`, and `idRange` is accepted as either `{start, end}` (what
  the staff console sends) or a two-element array (what `startRejudgeJob` writes).
- **Crons** are judge recovery (`judging.recoverStuckSubmissions`, 1 min), judge offline marking
  (`judgeApi.markOfflineJudges`, 1 min), stale contest-mode cleanup (`jobsContests.sweepContestMode`,
  5 min) and stats refresh (`stats.refresh`, 15 min). `convex/maintenance.ts` and its four no-op stubs are
  deleted. Section 12's "hot problems refresh" has no cron: `problems.hotProblems` computes the box from
  the submission window on read, so there is nothing to refresh. Add one only if that query is ever cached.
- **All rate limits live in `convex/lib/rateLimiter.ts`.** `submitDaily`, which `submissions.submit` used to
  configure inline at the call site, is a named limit there with `SUBMISSION_DAILY_LIMIT`.
- **`submissionsByProblemResult` is removed.** It was declared in `lib/aggregates.ts` and registered in
  `convex.config.ts` but nothing read it and nothing maintained it, so it would have answered 0 forever.
  The three profile aggregates (`profilesByPP`, `profilesByRating`, `profilesByProblemCount`) stay.
- **Every write that moves a profile's points goes through `rankings.patchProfile` or
  `rankings.insertProfileAggregates`**, because Convex has no triggers and the aggregates are keyed on
  `points`, `performancePoints`, `problemCount`, `rating` and `isUnlisted`. That is
  `judging.recomputeProfilePoints`, `profiles.recalculateProfilePoints`, `profiles.ensureProfile` (through
  `upsertProfile`), `admin/users.*` and `importer.insertBatch`. After a bulk import run
  `rankings.rebuildAggregates` anyway: an interrupted import leaves the tree short.
- **Two new environment variables.** `AUTH_URL` is the web app origin the Convex problems API calls to
  verify an API key against Better Auth's api-key plugin; setup sets it on the deployment only when the
  container can reach the host (the same probe as `AUTH_JWKS_URL`), and leaves it unset otherwise so the
  `apiKeys` table fallback is used. `LEGACY_SECRET_KEY` is DMOJ's `SECRET_KEY`, needed for API v2 tokens
  minted by the old site to keep verifying; it is only set on the deployment when it is not blank.
- **`apps/web/src/lib/simple-markdown.tsx` is deleted.** The feed routes, `/` and `/about` render through
  `renderMarkdown` from `@moj/content`, which is async: a page has to await it before the JSX, and the feed
  entries are built with `Promise.all`. Feeds render with `{highlight: false, lazyLoadImages: false}`,
  since a reader has none of the CSS either needs.
- Two files carried a literal NUL byte inside a string (`judging.ts`'s judge-pin sentinel and the
  importer's report keys), which made git and grep treat them as binary. They are written as `\u0000`
  escapes now; the runtime value is unchanged.
- Test-only modules under `convex/` are named with two dots (`contests.fixtures.ts`,
  `problems.fixtures.ts`, alongside the existing `fixtures.helpers.ts` and `*.setup.ts`) because Convex's
  bundler skips any basename with more than one dot. A single-dot helper there would be pushed to the
  deployment.
- `convex/_generated/api.d.ts` was hand-merged, not generated: `npx convex codegen` needs a deployment and
  there is none in this worktree. It lists exactly the modules Convex's own entry-point rules select, so
  the next `convex dev` in the main tree should produce an identical file.

## 2026-09-11, problems pages

- Spec section 20's spoiler rule asks for the "Show contests" toggle to be remembered as a profile
  preference. `profiles` has no column for it and this branch cannot deploy a schema change, so the
  preference lives in `localStorage` under `moj.show-contests`, which is still per viewer and survives a
  reload. Wiring it to a profile field means adding `profiles.showContests?: boolean`, exposing it on
  `viewer.current` and accepting it in `profiles.updateProfile`; nothing on the page changes but the
  read and the write.
- `packages/ui`'s `PageTabs` / `TitleRow` / `TabBar` take an optional `linkAs`, the component a tab's
  `href` renders as. It defaults to a plain anchor, so every existing call is unchanged; the problem
  pages pass `next/link` so switching tabs is a client navigation and the shell's route progress bar and
  page-enter reveal both run. Without it a tab is a full page load and the change reads as a jump.
- `packages/ui` gained `Slider`, a Radix slider on the tokens. `@radix-ui/react-slider` was already a
  dependency of the package with no component using it, and DESIGN section 17.1 asks for the point range
  to be one; the design system forbids `input[type=range]`.
- `convex/pages/problems.ts` is new: `filterOptions` (the problem types, groups and contests the filter
  panel offers, with facet counts over the problems the viewer may see) and `rejudgePreview` (how many
  submissions the manage-submissions filter matches, through `jobs.matchesFilter`, so the confirmation
  can name the number). Neither existed on `problems.ts`, and both are page reads rather than domain
  reads. `/problems/` degrades to deriving its options from the current page while the module is
  undeployed.
- The statement column's 74ch measure (DESIGN 14.2) and the frame on a statement image are applied by
  `components/problems/Statement.tsx` rather than `content.css`, which lives in `@moj/content` and is
  not this branch's to edit.
- `formatMemoryLimit` prints megabytes always, as DMOJ's `kbsimpleformat` does; a limit of 1 000 000 KB
  reads "976.6 MB" rather than a six-digit kilobyte count.
- The problem page's tab bar carries the links DMOJ keeps in the info box (submissions, editorial,
  ranks, vote, test data, manage submissions, clone), which is what the club asked for. The info box
  keeps "Submit solution", the submission links and the ticket row, as DESIGN section 14.1 lists them.
  The Clone tab is gated on `canEdit`; DMOJ gates it on `judge.clone_problem`, which `problems.get`
  does not return.
- `/problem/[code]/clone` clones through `admin/problems.create` with the source problem's fields, the
  cloner as its author and `isPublic: false`. DMOJ's `ProblemClone` copies the same metadata; test data
  is not copied there either.
- `TitleRow`'s wrapper is `grid-cols-1`, not a bare `grid`. An `auto` grid track sizes to max-content, so
  a page whose tab strip is wider than the viewport pushed the whole title row past the right edge and
  the body scrolled horizontally at 375 px, which section 22 forbids. The strip still scrolls inside its
  own wrapper.
- The editorial confirmation (spec section 20) is a kit `Dialog` opened by the Editorial tab, and its
  "don't ask me again" flag lives in `localStorage` under `moj.editorial-confirmed`. A direct visit to
  `/problem/<code>/editorial` is deliberately not intercepted, so a shared link still works.
## 2026-09-11, users and organisations pages

- **New Convex module `convex/pages/users.ts`**, with the two reads no backend module exposed and the
  pages need. `organizationsFor({profileIds})` returns each ranked user's organisations, which is the
  `organization-column` DMOJ draws beside a username on a contest ranking and which the leaderboard reuses;
  `dataExportDownload({})` turns the storage id `profiles.dataExportStatus` reports into a URL, because a
  storage URL can only be minted inside a function and `/data/download/` has to redirect to one. Both are
  covered by `convex/tests/pagesUsers.test.ts` and are registered in `convex/_generated/api.d.ts` by hand,
  as the rest of that file already is. Every page that reads them does so through a `.catch(() => null)`
  fallback, so they degrade to a leaderboard with no organisation chips until the module is deployed.
- `organizations.list`, `organizations.get` and `classes.get` gained `legacyId` on the rows they return.
  DMOJ addresses an organisation as `/organization/<pk>-<slug>` and a class as `<cpk>-<cslug>` inside it,
  and the pk was not on any payload. Next cannot put two dynamic parts in one path segment, so the routes
  are `app/organization/[handle]` and `.../class/[klass]`, and `apps/web/src/lib/organizations.ts` splits
  the leading digits off. A link with no pk still resolves: the slug is what the query takes.
- **`@moj/ui`'s rating thresholds were wrong.** `ratingClass`/`ratingTitle` used 1200/1500/1800/2200/2600,
  where `judge/ratings.py` and `@moj/core`'s `RATING_VALUES` use 1000/1300/1600/1900/2400/3000. They are
  DMOJ's now, and `RATING_VALUES`, `ratingLevel` and `ratingProgress` are exported beside them so nothing
  else has to restate the table.
- **`@moj/ui`'s `Select` rendered an empty trigger.** Radix draws the trigger's label by portalling the
  chosen item's text into the value node, which needs the item mounted; closed, nothing was shown — the
  footer's language switcher and every filter select on the site were blank. The convenience `Select` now
  renders the selected option's label as `SelectValue`'s children and tracks an uncontrolled value, so a
  closed select always shows its selection.
- **`apps/web/src/proxy.ts` no longer redirects `/_next`.** The trailing-slash redirect fired on
  `/_next/hmr`, which is a websocket upgrade in development, and broke the handshake on every page load.
- `apps/web` depends on `@moj/core` (and lists it in `transpilePackages`) so `UserLink` can build DMOJ's
  `rating <rate-class> <display_rank>` string through `getUserCssClass` rather than restating it. It is
  imported as `@moj/core/ratings`, the package's own deep entry point: importing the barrel pulls the whole
  domain layer into the client bundle, and turbopack does not resolve its `export *` re-exports.
- `recharts` is a new dependency of `apps/web`: the rating history chart. DESIGN.md section 20 names
  Chart.js 4 or Recharts; Recharts is the one that takes CSS custom properties straight into its SVG
  attributes, so the rating bands and the line are theme-aware with no JavaScript reading the tokens.
- **The user page keeps its sidebar on the left**, which is `user/user-base.html`'s own layout, rather than
  the right-hand `.info-float` of DESIGN.md section 7. Section 7 describes `common-content`; the user page
  is not one, and DMOJ puts the gravatar column first.
- The About tab shows a **Best submissions** panel — the ten highest-scoring solved problems, linking to
  the Problems tab. `profiles.userPage` already returns `bestSubmissions` for the Problems tab and the
  brief asked for best submissions on About; the full grouped list stays on `/user/[user]/solved`.
- `/user/[user]/solved`'s "Compare with me" keeps its state in the URL (`?compare=1`) rather than in a
  posted form, so a comparison is a link. DMOJ's control is a `hide_solved` checkbox that submits the form.
- `/organization/[pk]-[slug]/kick` is a page: pick a member, confirm, kick. DMOJ hides the same mutation
  behind a per-row button that only appears on hover, which is not reachable by touch or keyboard; the
  member table keeps its per-row Kick for admins as well.
- `forbidden()` needs `experimental.authInterrupts`, which the shell does not enable, so the organisation
  pages that are admin-only render `ErrorScreen` with a 403 in place instead of raising it.
- `apps/web/src/components/submissions/SubmissionList.tsx` is a **placeholder** with the props the brief
  named (`username`, `problemCode`, `contestKey`, plus `pageSize` and the empty-state copy). It renders
  `submissions.list` in DESIGN.md section 12.2's row shape so the Submissions tab is finished; the
  submissions agent's component replaces it at integration.
## 2026-09-11, the hall scoreboard

- **The carousel cross-fades; it does not slide.** The fork translates a track between divisions;
  DESIGN.md section 16.2 asks for a cross-fade over `--dur-slow`/`--ease-out` with no movement, and that is
  what `/scoreboard/[event]` does. The panels are stacked and only the active one takes pointers, so each
  division keeps its own scroll position for the auto-preview tour.
- **The reveal is a mutation, not local state.** The fork runs its ceremony entirely in the browser: the
  organiser's tab holds the revealed cells and nothing else on the network sees them. MOJ already had
  `scoreboard.revealStep` / `revealUndo` / `revealAll` writing `contests.revealState`, so the page calls those
  and lets the subscription push the new board to every screen at once — the projector, the stream and the
  organiser's laptop turn over the same result at the same moment. Consequences: "reveal all" is one server
  call rather than one undoable client step, and undo walks the persisted list.
- **The ceremony's target and the server's target can differ under the attendance filter.** The page
  highlights the bottom-most frozen cell of the *displayed* rows, as the fork does, so an in-person-only board
  never stops on a remote competitor. `scoreboard.revealStep` picks the bottom-most frozen cell of the whole
  division. With "In person" on, the step may therefore resolve a row that is not on screen. Either the
  mutation grows a participation filter or the page passes the target it means; the mutation is not this
  branch's file.
- **The event feed is derived from the board, not from a second subscription.** `scoreboard.event` already
  carries every solve time and every outstanding submission, so `feedEntries` in
  `apps/web/src/components/scoreboard/hall.ts` builds the sidebar from the same payload: no extra query, and
  the sidebar can never disagree with the grid beside it. It shows solves and pending cells; the fork's
  per-submission entries (wrong answers, wall-clock times, a verdict chip that settles in place) need
  submission rows, so **`convex/pages/scoreboard.ts` adds a `feed` query** that returns exactly those, covered
  by `convex/__tests__/scoreboardFeed.test.ts`. It is not deployed on this branch — swap `feedEntries` for it
  at integration. Its ordering rule is the freeze's: an entry from inside the freeze reads as pending and
  carries no verdict for staff as much as for the hall, so the sidebar cannot spoil the grid or the reveal.
  The derived list caps the outstanding block at a fifth of the sidebar, because everything the freeze is
  holding is newer than every solve on the board and strict time order would bury them.
- **The olympics pictograms are the fork's artwork, not Lucide.** DESIGN.md section 16.2 says the theme uses
  Lucide's sport-adjacent glyphs; the fork ships eleven drawn pictograms and a gold medal, and they are what
  the club has already put on a projector. They are copied to `apps/web/public/scoreboard-themes/olympics/`
  and the Jinja `sports` / `problem_icons` tables become
  `apps/web/src/components/scoreboard/olympics.ts`. Still no emoji. One behaviour change: the fork leaves a
  problem the table does not name as a plain number, and MOJ falls back to the sport at that column's
  position, so every column carries a pictogram as section 16.2 describes. The explicit table still wins.
- **`tokens.css` gained a `.theme-dark` scope.** The hall is dark by identity whatever the viewer's theme is
  (section 16.2), and the dark palette was only reachable through `:root[data-theme="dark"]`. The dark block's
  selector list now also carries `.theme-dark`, which the hall's root element uses; nothing else changes.
- **`SiteShell` renders `/scoreboard/[event]` bare.** The hall board is a projector surface with its own
  chrome, so the nav, the ContestBar, the footer and the content column are not rendered for it. `/scoreboard/`
  itself is an ordinary page.
- **No countdown beside the division title.** Section 16.2 puts one there, but `scoreboard.event`'s division
  payload carries `duration`, `freezeOffset`, `hasStarted` and `hasEnded` — no absolute start or end time — so
  the page cannot count down without changing that query's shape. The freeze banner states the freeze as a
  contest clock ("froze at 3:00, with the final 60 minutes withheld") rather than a wall-clock time. Add
  `startTime`/`endTime` to the division payload when the query is next edited and the countdown is a
  ten-line component.
- **The badge editor saves one badge at a time.** The fork posts `{add: [], remove: []}` in one request;
  `scoreboard.setTag` takes a single slug, so the modal diffs the boxes and sends one mutation per changed
  badge. A partial failure therefore leaves the earlier changes applied, and the modal stays open on the
  boxes as they were left.
- **Staff cannot reach the page in this build.** `apps/web/src/proxy.ts` sends any staff account without a
  second factor to `/accounts/2fa/`, and that page has no enrolment control yet, so no staff session can open
  any page — including this one. The reveal bar, the badge editor and the `E`/`R` shortcuts are therefore
  unexercised in a browser; they are covered by the payload's `canReveal` / `canEditTags` flags and by the
  mutations, which were driven directly against the deployment. Nothing here needs changing once the accounts
  agent lands 2FA enrolment.
## 2026-09-11, staff console part one

- The console's read models live in a new `convex/pages/admin1.ts`: `consoleViewer`, `problemsList`,
  `problemOptions`, `problemEdit`, `cloneProblem` (the one mutation, `judge.clone_problem`), `contestEdit`,
  `contestOptions`, `resolveProfiles`, `resolveContestRefs`, `profileSearch`, `problemSearch`,
  `submissionsList`, `jobsList`, `revisionsFor` and `scoreboardOptions`. Everything they write goes through
  the existing `convex/admin/*` mutations; these only read, and every one of them is staff-gated and returns
  an empty result rather than throwing, so a console page never renders an error boundary.
- `convex/admin/*` speaks in ids where a form speaks in names, so `contestEdit` resolves the eight profile
  arrays, the organisations, the classes and the tags to names, and `resolveProfiles` / `resolveContestRefs`
  turn them back into ids at save time. DMOJ's admin did the same thing with select2 endpoints.
- **A console page cannot subscribe to `pages/admin1` until it is deployed.** `useQuery` throws a missing
  function straight through React, so the console reads those modules through
  `apps/web/src/components/admin/useConsoleQuery.ts`, which runs the query as a promise and reports
  `unavailable` instead. `apps/web/src/components/admin/fallbacks.ts` then serves each screen from the
  deployed public and admin queries (`admin/problems.editable`, `problems.get`, `admin/contests.get`,
  `submissions.list`, `jobs.recent`), and `ConsoleNotice` says what is missing. Once `pages/admin1` is on the
  deployment `unavailable` is always false and both files collapse to a plain `useQuery`; the integrator can
  delete them and swap the call sites back.
- The console's title row is `--fs-h2`, not the `--fs-h1` of a public page: DESIGN 19.2 turns the density up,
  and a 26px heading over 28px rows reads like a public page that lost its content column. The checklist's
  "h1 is 26px" line applies to the public pages.
- DESIGN 19.2 puts the console rail on `--surface`. With `--bg-2` now white and `--surface` white with it, a
  white rail on a white ground is a hairline away from invisible, so the rail and the console's own bar are
  `--surface-2`, the well tint. Everything else in 19.2 is unchanged.
- There is no date picker in `@moj/ui` and no `react-day-picker` in the tree, so
  `apps/web/src/components/admin/DateTimeField.tsx` is the recipe from DESIGN 11.4 built out of `Popover` plus
  a month grid of buttons and a mono time box. No native `<input type="date">` anywhere.
- `apps/web/src/components/markdown/MarkdownEditor.tsx` is a placeholder with the props the community wave's
  editor is expected to take (`value`, `onChange`, `preset`, `rows`, `id`, `placeholder`, `disabled`,
  `invalid`, `ariaLabel`); the integrator keeps theirs.
- Test data has no console tab of its own. The public editor at `/problem/<code>/test_data/` validates the
  archive as you go, so the console's Test data tab links to it rather than duplicating it.
- Problem cloning had no mutation anywhere (`judge.clone_problem` was only in the permission list), so
  `pages/admin1.cloneProblem` is new: statement, limits and taxonomy under a new code, private, with the
  viewer as its only author and no test data or submissions, matching DMOJ's `ProblemClone`.
