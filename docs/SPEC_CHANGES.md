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
