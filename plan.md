# Contest browsing routes and submit reminder

## Goal and fixed decisions

Use `/contest/[key]/problem/[code]/` in place of `/problem/[code]/?contest=[key]`, with thin routes invoking the same underlying pages. Carry that context through the normal submission/source/resubmit flow.

- `SiteShell` stays in `app/layout.tsx`; `ContestBar` stays inside its existing measured fixed header.
- Accessible, released problem chips are always visible. The overview's reminder does not control navigation.
- Keep the existing overview cover and its two-week, contest-scoped dismissal cookie.
- On a submit attempt, show a confirmation before sending when the cookie is absent **and** the live-contest join reminder applies. A cookie means acknowledgement, never participation. There is no persistent warning in the form.
- Context comes from the URL. Actual participation still controls scoring, personal timing, lockdown, and proctoring.
- No route groups, shell relocation, new providers, shared reveal state, implicit acknowledgement on problem visits, or cookie migration.
- Keep DOMjudge's old structure; make only necessary routing adjustments.

This document plans implementation. Preserve the branch and local edits while adapting them; do not reset the working tree. Only `plan.md` is being changed during planning.

## 1. Add only the routes used for contest browsing

Existing standalone routes remain available. Use the existing public contest keys, problem codes, and submission identifiers.

| Standalone route | Additional contextual route |
| --- | --- |
| `/problem/[code]/` | `/contest/[key]/problem/[code]/` |
| `/problem/[code]/submit/` | `/contest/[key]/problem/[code]/submit/` |
| `/problem/[code]/editorial/` | `/contest/[key]/problem/[code]/editorial/` |
| `/problem/[code]/submissions/` | `/contest/[key]/problem/[code]/submissions/` |
| `/problem/[code]/submissions/[user]/` | `/contest/[key]/problem/[code]/submissions/[user]/` |
| `/problem/[code]/rank/` | `/contest/[key]/problem/[code]/rank/` |
| `/problem/[code]/resubmit/[id]/` | `/contest/[key]/problem/[code]/resubmit/[id]/` |
| `/problem/[code]/tickets/` | `/contest/[key]/problem/[code]/tickets/` |
| `/problem/[code]/tickets/new/` | `/contest/[key]/problem/[code]/tickets/new/` |
| `/submission/[id]/` | `/contest/[key]/submission/[id]/` |
| `/src/[id]/` | `/contest/[key]/src/[id]/` |

Keep the existing contest overview, rankings, statistics, and contest-filtered submission routes unchanged. A contextual problem submissions page retains its existing problem-wide filter; adding a prefix does not turn it into a contest-only list.

Do not mirror `vote`, `test_data`, `manage/submission`, or `clone` as part of this work. Those auxiliary/maintenance destinations intentionally use their existing standalone pages, as do staff-console links. Global navigation, user/organization links, and the catalogue also exit contest browsing context.

PDF, samples, files, and raw source keep their existing endpoints. A created ticket still opens `/ticket/[id]/`; no second ticket-conversation hierarchy. Check that relative statement images and file links still resolve under the deeper page URL.

### Reuse, do not duplicate

A nested route resolves its parameters and forwards them, ordinary search parameters, and an explicit optional browsing key to the same page implementation used by the standalone route.

Reuse existing page functions where they already fit. Extract a shared module only where explicit browsing data or duplicated logic requires it; do not mandate a new component/loader layer for every wrapper. Preserve shared metadata behavior, translations, and permissions. Declare required route configuration such as `dynamic = "force-dynamic"` explicitly in the new entry points so the framework can analyze it.

The statement and submit/resubmit implementations need the browsing key explicitly. Other page content should remain unchanged unless a link, redirect, or resource check needs it. Do not fabricate a `searchParams.contest` to adapt to the old API.

## 2. Update the existing URL helpers and shell parsing

Adapt `lib/contest-context.ts`, `ContestLink`, and `useContestHref` rather than building a routing framework:

- Read the browsing key from the nested pathname, not the query string.
- Generate a nested URL for exactly the supported HTML destinations above.
- Preserve ordinary query parameters and fragments; leave already-contextual destinations, explicit other-contest links, external URLs, resource endpoints, and deliberate exits alone.
- Outside a contest path, links remain standalone. The floater and `ContestLock` supply their intended contest key explicitly.

Keep the existing joined and browsing queries in `SiteShell`, including `initialContest`, `useViewerLive`, and the loading placeholder. Its contest-prefix parsing already covers the new hierarchy. Update current-problem extraction and `contestContainsProblem`, which currently recognize only `/problem/[code]/…`, so nested pages highlight the correct chip and still check membership. Use exact path segments for contest keys.

Leave header markup, measurements, sticky offsets, account controls, fullscreen exceptions, and the floater's participation behavior in place. No new server shell seed or subscription relocation is needed.

Audit the ordinary browsing flow for remaining bare destinations: overview rows/editorials, ranking cells, MOSS links, bar/floater, problem tabs/sidebar/breadcrumbs, previous/next, editorial confirmation, quick submit, submission/source tabs, and resubmit. Preserve contextual destinations in login `next`, `me` redirects, and submission-filter/user-search navigation.

### Compatibility scope

The query-context feature is introduced by the current branch relative to `origin/main`. There is no demonstrated requirement to support published query-context URLs. Do not add proxy redirects or retain two runtime context formats by default. Existing standalone URLs continue to work; an old branch-only `?contest=` link can simply be standalone.

If deployment or externally shared-link evidence establishes a compatibility requirement before implementation, add one narrowly tested redirect using the same route helper. Do not otherwise expand this change into a URL migration system.

## 3. Keep the cookie local to the reminder; warn on submit attempts

Keep the existing cookie name, value `1`, path `/contest/<key>`, two-week lifetime, HttpOnly, SameSite, and production Secure settings. Nested page requests naturally receive it.

Read it on the server where the form is loaded:

- The overview already reads it; pass that value through `ContestDetailClient` and `QuickSubmit`.
- The shared submit/resubmit page reads it when given a browsing key and passes it to `SubmitForm` with the relevant contest seed.
- The shell and bar do not need the cookie. Do not read HttpOnly cookies in client JavaScript.

Keep the cover's local optimistic dismissal and existing server action. Successful writes must update the props used by subsequently opened forms, including prefetched submit pages and quick-submit dialogs. Consume current props rather than freezing them in a one-time state initializer. If persistence fails, the cover can stay locally dismissed while a later form still warns because no cookie was saved.

### Warning rule

```text
show confirmation on submit = valid contest context
               AND existing live-contest join reminder applies
               AND acknowledgement cookie is absent
```

Reuse the overview's current eligibility rules and exemptions: started, not ended, not currently participating in that contest, and anonymous or live-joinable. Preserve editor/tester/spectator/restriction behavior. The form's existing authentication and submit permissions continue to apply. No warning is inferred from every contest that happens to contain a standalone problem.

Use the existing local `showJoinWarning` query field as the eligibility signal where useful; it must no longer gate navigation. Keep coverage that it agrees with the overview policy. Do not add a new backend endpoint solely for this warning.

Suggested copy: “You haven’t joined {contestName}. Submitting now won’t count toward this contest.” Do not claim it is necessarily a practice submission: actual participation in another contest containing the problem may determine attribution.

Put the check in the shared submission-attempt handler used by `SubmitForm`, covering full, compact, and resubmit forms. The warning appears only after an attempt, before the submission mutation runs. Reuse the existing dialog primitives with translated copy and two actions: **Go back** and **Submit anyway**. Go back, Escape, or closing the dialog leaves the draft intact and creates no submission. Submit anyway sends the validated attempt once. Without an applicable warning, the normal attempt sends immediately.

Run existing source/language validation before opening the warning. Keep the pending validated payload for confirmation, and have the confirmation call the actual send operation rather than recursively reopening the warning. Guard repeated clicks/keyboard shortcuts while a confirmation or send is pending. Verify focus returns to the form when cancelled, including inside a quick-submit dialog.

Seed eligibility from the server; use the existing keyed contest query when live updates are needed. Do not mount warning queries for closed submit dialogs or add a provider to share them. Joining/leaving should update applicable warnings without treating a saved cookie as participation. Route both the button and editor keyboard shortcut through the same attempt handler so neither bypasses the warning.

Do not automatically join, add a join-and-return flow, or change the draft mechanism. The existing contest navigation already leads to the join controls. Submit anyway confirms this attempt; it does not silently write the overview-dismissal cookie. Opening a form, showing the warning, or cancelling it never acknowledges the reminder. The existing View problems action remains the persistent acknowledgement, and the mutation remains authoritative for access and attribution.

| Situation | Bar chips | Additional submit warning |
| --- | --- | --- |
| Unjoined, applicable live contest, no cookie | Visible if released and accessible | Confirm before sending |
| Same situation with saved cookie | Unchanged | Suppressed |
| Joined or live reminder otherwise inapplicable | Unchanged | Not shown |
| Direct problem entry or ordinary tab navigation | Unchanged; no acknowledgement is created | Follows the same rule |
| Unreleased or inaccessible problem | Existing access rules apply | Never grants access |

Remove the local `contest-problems-viewed.ts` store, its custom window event, the cover's synchronization effect, and the cookie-dependent condition in `ContestBar`. No replacement reveal state or CSS coupling is needed.

## 4. Preserve access rules and validate the new nesting

Reuse existing resource queries and `navBar({ key, browsing: true })` for contest access and its released problem list. Put any repeated contextual validation in a small server helper; no new authorization system or schema changes.

For a nested problem, validate that the viewer can access both the contest context and the problem, and that the problem appears in that contest's released list. A nested path must not bypass the membership check that the old query-context shell performed. For a fabricated/unreleased pairing, use an ordinary not-found/access result; do not display an unrelated resource as belonging to the contest. Its standalone URL remains independently available under its existing permissions. Preserve the existing overview's private-contest explanation.

For nested submission/source pages, first apply their existing visibility checks, then validate the submission's actual problem against the browsing context. A practice or other accessible submission for that problem is allowed: do not require its recorded contest ID to match the browsing key. Keep actual attribution unchanged. Resubmit must use the matching problem's previous submission.

Update `isInsideContest` and both server/client callers for exact contest-key boundaries and nested problem membership. Its current prefix shortcut must not admit arbitrary problems just because the path starts with the joined contest's name. Resource loaders validate submission/source relationships; do not turn the pure pathname helper into a database query. Preserve existing account/proctor/resource exceptions.

Do not change scoring, submission-mutation semantics, personal clocks, proctoring, or the existing distinction between browsing a contest and participating in one.

## 5. DOMjudge boundary

Keep its existing shell arrangement, problemset, submit dialog, and clock. Update links/parser behavior needed for the new paths. Page-owned dialogs can receive warning props through the shared form. Do not build a cookie bridge solely for the legacy header-owned submit dialog or redesign DOMjudge to match the standard reminder behavior.

## 6. Implementation order

1. Update and test the existing pathname/link helpers, including supported routes, deliberate exits, exact keys, filters, and fragments.
2. Add thin contextual routes, sharing current page implementations and applying the small contextual resource check. Cover the full statement → submit → submission → source → resubmit cycle and the listed problem tabs.
3. Adapt `SiteShell` current-problem/membership parsing and lockdown parsing. Keep the shell and bar in place.
4. Remove the transient reveal machinery and chip gating. Add the cookie-conditioned confirmation to the shared submission-attempt handler; pass server props through its standard entry points.
5. Audit links and redirects, adapt existing tests, and perform the checks below. Change no unrelated application structure.

## 7. Focused verification

Add or adapt tests for behavior introduced here; reuse existing permission and participation tests rather than rebuilding a broad test matrix.

- **Routes:** nested links, explicit other-contest destinations, no double prefix, auxiliary/resource/global exits, filters/fragments, and exact key boundaries.
- **Resource checks:** valid public and participant-only problems; unreleased/inaccessible/unrelated pairings; accessible practice submissions; private source remains private; nested paths do not bypass lockdown.
- **Warning:** missing/saved/wrong-contest cookie, joined/ended/exempt viewers, live participation changes, full/compact/resubmit forms, button/keyboard attempts, cancellation preserving the draft, zero mutations before confirmation, and exactly one mutation after confirmation. Verify cookie scope/expiry and no implicit cookie writes.
- **Integration:** use actual cover/bar/form consumers for key cases. Current mocked shell tests and server-only cover renders cannot alone verify cookie updates reaching a subsequently opened form.

Browser-check these flows:

1. Without a cookie, navigate overview → ranking → problem → submit. Accessible chips stay visible and no warning appears just from opening the form. Attempt submission: confirmation appears before anything is sent. Cancel without losing the draft, then confirm a later attempt and verify one submission. Direct submit links and keyboard attempts behave the same.
2. Dismiss the overview reminder; open a prefetched submit page, a quick-submit dialog, and a new tab. The saved cookie lets an otherwise-valid attempt submit without the warning. Another contest's cookie does not.
3. Complete statement → submit → submission → source → resubmit; refresh and use back/forward. Context stays in the pathname, and standalone pages still work independently.
4. Browse B while participating in A where allowed: B's bar, A's floater, unchanged attribution. Check locked-down navigation and hydration do not expose an unintended route.
5. Smoke-check desktop/mobile header offsets, sticky content, account/impersonation controls, and DOMjudge navigation. These existing structures should not change.

Run focused Vitest suites, web/Convex typechecks, lint, and a web production build with the project's local configuration. Use browser verification for cookie delivery/prefetch and layout behavior. Record unavailable-service limitations rather than claiming blocked checks passed.

## Done when

The nested URLs reuse the existing page behavior, the complete browsing/submission flow retains context, SiteShell and its bar remain in place, accessible navigation is independent of acknowledgement, and an applicable submit attempt prompts before sending only without the scoped cookie. No extra layouts, global dismissal state, maintenance-route copies, or speculative compatibility layer are introduced.
