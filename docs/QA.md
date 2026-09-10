# Integration QA, 2026-09-11

One pass over everything the page builders could not reach, run against the local
stack with the production import, a live `moj-judge:tier1` container and the web
dev server on http://localhost:3000. Every row is pass, or fail with the commit
that fixed it.

Accounts used: `admin` (the documented fixture), `mojqa` (a second superuser made
for this pass because `admin`'s password trips the breach gate on every login),
and `mojtester1` / `mojtester2` (ordinary members, registered through the real
sign-up form).

## Judge

| Check | Result |
| --- | --- |
| `moj-judge:tier1` starts on host networking and hand shakes | pass — 383 problems, 15 runtimes |
| `npm run e2e:judge` | pass — `D/AC`, 100 points, 6 cases over 2 batches |
| Submit through the real submit page, custom checker (`pickyeater`) | pass — AC 100/100, checker feedback per case ("Optimal!", "Correctly identified as impossible.") |
| Submit through the real submit page, custom grader (`guessnumber`, interactive) | pass — AC 5/5 |
| Rejudge a problem's submissions from `/problem/<code>/manage/submission` | pass — job ran, judge regraded |
| `/status/` and `/admin/judges/` show the judge online with load and runtimes | pass |
| `docker compose --profile judge up -d judge` works on this machine | fixed — the compose judge now uses `network_mode: host`; the bridged variant moved to the `judge-bridge` profile |

## Editor-only problem surfaces

| Check | Result |
| --- | --- |
| `/problem/<code>/test_data` | pass — data form, case table and the generated `init.yml` panel render; not saved, because saving would replace the hand written `init.yml` the judge reads |
| `/problem/<code>/manage/submission` | pass — filters, counts, rejudge and rescore |
| `/problem/<code>/clone` | pass — cloned `aplusb` to `mojqaclone` (private, delete it when you are done) |
| `/problem/<code>/pdf` | fixed — the Typst templates were resolved through a bundler-traced `import.meta.url`; the route now loads `@moj/content` at runtime and `TYPST_TEMPLATE_DIR` overrides the package-relative default. 45 KB PDF, `application/pdf` |
| Editorial confirmation dialog | pass — "View the editorial?" with "Yes, show it" / "No" and "Don't ask me again" |
| Appeared-in behind a "Show contests" toggle, under "Problem type" | pass |
| Language switcher on `halftheproblem` | pass — `es` renders the translated title and body, `<html lang="es">` |

## Contests

A test contest `mojtesticpc` was created for this pass and left running: ICPC
format, 60 minute freeze, blind during the freeze, visible, three real public
problems (`aplusb`, `pickyeater`, `guessnumber`), 11 Sept 01:55–04:55.
**The key is `mojtesticpc`, not `mojtest-icpc`**: DMOJ's own contest key
validator is `^[a-z0-9]+$`, so a hyphen is rejected on both sites.

| Check | Result |
| --- | --- |
| Create a contest through the console | pass |
| Contest edit tabs (General, Problems, People, Actions, Revisions) | pass |
| Add problems, ICPC letter labels | pass — A, B, C |
| Join, contest mode, contest bar on a problem page | pass — bar carries A/B/C, Standings, My submissions, Clarifications and the countdown |
| Frozen cells for a non-editor | fixed — the pending marks were fetched only in the browser, so the first paint showed "—"; the server fetches them now and a frozen cell renders `?` with its attempt count |
| Reveal as an editor | pass — anonymous board shows the full scores immediately after |
| Freeze again (un-reveal) | pass |
| Disqualify and reinstate from the ranking | pass |
| Post a clarification | pass |
| MOSS page | pass — renders the "MOSS is not configured" empty state |
| Contest scoring summary | fixed — `**bold**` from `@moj/core`'s short-form display was printed literally |
| Clone a contest | not exercised (the clone route renders; nothing was cloned) |

## Scoreboard

| Check | Result |
| --- | --- |
| `mojtesticpc` added to the `mcpc2025` event as a third division | pass |
| `/scoreboard/mcpc2025/` renders three divisions, frozen cells and the reveal control | pass |
| Event feed | fixed — swapped the board-derived feed for the deployed `pages/scoreboard.feed`; it now shows per-submission events with verdicts (SOLVED / WRONG / PENDING) |

## Staff console

Every screen was walked and returns 200: overview, problems, contests,
submissions, scoreboards, jobs, users, organisations, classes, tickets, API keys,
judges, languages, navigation, config, config/branding, flat pages, blog,
licences, tags, plus the new/edit routes for problems, contests, scoreboards,
users and organisations.

| Check | Result |
| --- | --- |
| Console shell, rail, section index | pass — after reconciling part two's editors against part one's shell |
| Rail link to API keys | fixed — `sections.ts` pointed at `/admin/apikeys/`, the route is `/admin/api-keys/` |
| Breadcrumb | fixed — the separator rendered an `li` inside the crumb's `li`, which React reported as a hydration mismatch on every console page |
| Create a problem end to end | pass — `mojqaconsole` (private, delete it when you are done) |
| Create a contest end to end | pass |
| User edit saves | pass — display name written and visible on the ranking |
| Mint an API key with `problems:write` | pass |
| `upload-problem.mjs --dry-run` against `http://localhost:3211` | pass |
| `upload-problem.mjs` for real, on a copy with a changed statement | pass — the statement changed on the site and was restored afterwards |
| Per-language limits through the problems API | fixed — the uploader writes the documented `python3` / `pypy3` keys and the endpoint only matched `languages.key`, so every repo's limits were silently dropped |
| Branding: set the MAPS logo, keep the default colours | pass — nav wordmark comes from the upload, the CSS block carries the tokens |
| Branding form left the unsaved-changes guard armed after a save | fixed |
| Impersonate and stop | pass |

## Accounts

| Check | Result |
| --- | --- |
| Register, activate, log in | pass |
| Staff 2FA gate and the `admin` TOTP recipe | pass |
| Breached-password interstitial | pass — `admin`/`admin` is in a breach corpus, so every login as `admin` lands on `/accounts/password/change/`. That is DMOJ's behaviour, not a bug, but it does mean the documented fixture cannot reach `/admin` without changing the password first |
| The interstitial outlived the account that caused it | fixed — the flag rode a cookie that a clean login and a sign-out both left in place, so the next account inherited it |
| A new profile took its username from the client | fixed — a client whose cached session lagged a sign-out wrote the previous account's username onto the new profile (`mojtester2`'s profile was created as `mojtester1`). The username comes off the token now |

## Chrome

| Check | Result |
| --- | --- |
| Command palette (Ctrl K): pages, actions, problem search | pass |
| Dark mode across five pages (`/problems/`, `/contest/mojtesticpc/ranking/`, `/user/mojtester1/`, `/admin/problems/`, `/blog/`, `/submission/<id>`) | pass — no light-on-light text, tokens resolve, code block readable |

## Left in place

- The judge container `moj-judge`, running on host networking.
- The contest `mojtesticpc`, running until 04:55, as the third division of the
  `mcpc2025` scoreboard event.
- `mojqa`, `mojtester1`, `mojtester2`, the `integration-qa` API key, and the two
  throwaway problems `mojqaclone` and `mojqaconsole`.
- `TYPST_BIN` in `.env.local` pointing at `.local/bin/typst` (gitignored), so the
  PDF route works on this machine.
