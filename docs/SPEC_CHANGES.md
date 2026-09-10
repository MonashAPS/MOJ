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
