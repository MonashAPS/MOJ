# Architecture

MOJ is four moving parts: a Next.js web app, a self-hosted Convex backend, a Postgres database that belongs to
Better Auth, and one or more judge containers. Everything a user sees is rendered by the web app; everything that
is stored, queried or scheduled lives in Convex; everything that runs untrusted code happens on a judge.

```
                       browser
                          |
                          |  HTML, then a websocket subscription
                          v
   +---------------------------------------------+
   |  apps/web (Next.js, port 3000)               |
   |    server components: fetchQuery             |
   |    client components: useQuery               |
   |    Better Auth routes under /api/auth        |
   +----------+--------------------------+-------+
              |                          |
   Drizzle    |                          |  Convex client, JWT from Better Auth
              v                          v
   +---------------------+     +-------------------------------------+
   |  Postgres           |     |  Convex backend (self-hosted)       |
   |    moj_auth         |     |    3210 cloud origin: queries and   |
   |    moj_dev          |     |         mutations from the browser  |
   +---------------------+     |    3211 site origin: HTTP actions   |
                               |         /judge/*, /api/problems/*   |
                               |    scheduler, crons, aggregates     |
                               +-------------------+-----------------+
                                                   ^
                                                   |  HTTPS, judge polls for work
                                                   |
                               +-------------------+-----------------+
                               |  apps/judge (Docker, DMOJ           |
                               |  judge-server with moj_packet.py)   |
                               |    /problems volume, sandbox        |
                               +-------------------------------------+
```

## The web app

`apps/web` is a Next.js App Router application on React 19. Routes match DMOJ's URLs exactly, so old links,
bookmarks and scripts keep working: `/problem/aplusb`, `/submissions/user/alice/`, `/contest/spring26/ranking/`
and the rest. [Compatibility with DMOJ](/guide/compatibility) has the full list of what that promise covers.

Pages are server components that call `fetchQuery` for the first render, then hand the result to a client component
that subscribes with `useQuery`. That gives a fast first paint with real data (and correct behaviour without
JavaScript for the static parts) plus live updates once the page is interactive. Long lists use
`usePaginatedQuery`.

Rendering of user content happens in `packages/content`: a unified pipeline of remark and rehype plugins that
accepts DMOJ's statement markdown, including `~math~`, and produces sanitised HTML with KaTeX and Shiki. PDF
statements are the same markdown converted to Typst and rendered by the Typst binary.

## Convex

The Convex backend is the database, the query layer and the scheduler in one process. Self-hosted, it stores its
data in a Postgres database of its own, named after the deployment, and exposes two origins:

- the **cloud origin** (3210 in development) serves queries, mutations and actions to the browser over a websocket.
  This is the connection that makes pages live;
- the **site origin** (3211 in development) serves HTTP actions defined in `convex/http.ts`. That is where the
  judge protocol, the problems API and the feeds live, because those callers speak plain HTTP.

Functions are grouped one file per area: `problems.ts`, `submissions.ts`, `contests.ts`, `judging.ts`,
`judgeApi.ts`, `scoreboard.ts`, `ratings.ts`, `admin/*.ts`, and `pages/*.ts` for reads that exist to serve one
page rather than to express a domain rule. Permission checks are pure functions in
`packages/core`, so the same rule runs in a query, in a mutation and in a test.

Counts and ranks that would otherwise mean scanning a table use the `@convex-dev/aggregate` component: user
points, ratings and problem counts each have an aggregate keyed for the list they sort. Convex has no triggers, so
every write that moves a profile's points maintains those aggregates by hand, and a bulk import is followed by a
rebuild. Submission, registration, password-reset and comment rate limits use `@convex-dev/rate-limiter`.

## Better Auth and Postgres

Authentication is Better Auth running inside the web app, with Drizzle over Postgres for its tables. It owns
sessions, passwords, two-factor secrets, passkeys and API keys. Convex does not store credentials; it trusts a
signed JWT.

The chain is: the browser signs in against `/api/auth/*`, Better Auth issues a session, `authClient.token()` mints
an RS256 JWT with `{sub, username, isStaff}`, and the Convex client sends that token with every request.
`convex/auth.config.ts` registers a `customJwt` provider for the issuer, so `ctx.auth.getUserIdentity()?.subject`
inside a Convex function is the Better Auth user id. That id is the identity everywhere; the `profiles` table is
keyed by it.

Password verification understands Django's `pbkdf2_sha256$<iterations>$<salt>$<hash>` format, which is what makes
[importing an existing DMOJ site](/admin/import) possible without asking anyone to reset their password. The first
successful login with a legacy hash rewrites it in Better Auth's own format.

## The judge and its pull protocol

Grading is the DMOJ judge-server, unchanged apart from a replacement packet layer (`dmoj/moj_packet.py`) that is
selected when the `MOJ_URL` environment variable is set. DMOJ's judge normally holds a long-lived TCP connection to
a bridge process and waits to be pushed submissions. MOJ inverts that: the judge polls over HTTPS.

That choice is what makes a judge easy to run anywhere. It needs no inbound port, no static address and no
certificate of its own, so a judge behind a home NAT or a university firewall works the same as one in the same
rack as the site.

Every call carries `{judgeName, judgeKey}`; the server hashes the key with SHA-256 and compares it against
`judges.authKeyHash`, and rejects blocked judges.

| Call | Direction | What it does |
| --- | --- | --- |
| `POST /judge/handshake` | judge to site | Reports the problem codes it has and the executors it found. Marks the judge online. |
| `POST /judge/heartbeat` | judge to site | Every 10 seconds, with the current load. Keeps the judge online. |
| `POST /judge/claim` | judge to site | Asks for one submission. Returns `null` when there is nothing to do. |
| `POST /judge/event` | judge to site | Grading progress: `grading-begin`, `batch-begin`, `test-case-status`, `batch-end`, `grading-end`, `compile-error`, `compile-message`, `internal-error`, `submission-terminated`. |
| `GET /judge/abort` | judge to site | Polled once a second while grading, so an aborted submission stops quickly. |
| `POST /judge/disconnect` | judge to site | Clean shutdown. |

Claiming is deliberate rather than first-come-first-served. Candidates are submissions with status `QU` ordered by
priority then date, where priority is 0 for contest submissions, 1 for normal ones, 2 for rejudges and 3 for batch
rejudges. A judge only claims a submission whose problem code and language it reported, only judges in the lowest
online tier claim at all, a submission pinned with `judgePin` goes only to that judge, and when the tier is busy the
rejudge priorities are skipped so that a large rejudge cannot starve live submissions.

If a judge dies mid-grade, a cron notices: submissions stuck in `P` or `G` whose judge has not sent a heartbeat for
60 seconds, or which have made no case progress for 15 minutes, go back to the queue once. A second failure marks
them as an internal error rather than looping.

## What runs where

| Process | Development | Production |
| --- | --- | --- |
| Web app | `next dev` on 3000 | Container behind Caddy on 443 |
| Convex backend | Container, 3210 and 3211 | Container, both origins proxied by Caddy |
| Convex dashboard | Container, 6791 | Optional, staff only |
| Postgres | Container, 5433 on the host | Container, not published |
| Judge | Container on the same host | One or more dedicated boxes |
| Typst | Binary in the web container, or `TYPST_BIN` | Binary in the web image |

## A submission, end to end

1. A signed-in user posts the form on `/problem/aplusb/submit`. The web app calls the `submissions.submit`
   mutation with the problem code, the language key and the source.
2. The mutation checks that the user may see the problem, that the language is allowed, and that the submission
   rate limit has room. In a contest it also checks the participation, the per-problem submission cap and whether
   the contest is running.
3. It inserts a `submissions` row with status `QU`, a `submissionSources` row with the code, and a priority: 0 in
   contest, 1 otherwise. The row is given an integer id of its own, because the judge formats the submission id
   into a process name and a document id would crash the grader. The mutation returns that id and the browser
   navigates to `/submission/<id>`.
4. The submission page subscribes to a query for that row and its test cases. It shows Queued.
5. A judge calls `POST /judge/claim`. `judging.claimNext` picks the row, sets it to `P`, records
   `claimedByJudgeId`, `claimedAt` and `judgedOnJudgeId`, and returns the source, the limits and the metadata.
6. Because the submission row changed, every subscribed browser is pushed the new value. The page shows
   Processing without asking for it.
7. The judge compiles the submission. A compile failure sends `compile-error` and grading ends there with `CE`. A
   warning sends `compile-message`, which is stored and shown under the verdict.
8. The judge sends `grading-begin`, then runs the cases. Each `test-case-status` event carries a batch of case
   results: position, a status bitmask, time, memory, points, total points and any checker feedback. The server
   decodes the bitmask in the order TLE, MLE, OLE, RTE, IR, WA, SC, otherwise AC, writes `submissionTestCases`
   rows, and updates the running `casePoints` and `caseTotal` on the submission.
9. Each of those writes reaches the subscribed pages, so cases appear one at a time in the browser.
10. `grading-end` runs `judging.finish`: time is the sum over cases, memory is the maximum, batched cases collapse
    to the minimum points and maximum total per batch, the result is the worst status by DMOJ's ordering, and the
    points are `casePoints / caseTotal * problem.points` rounded to three decimals, zeroed when the problem does
    not allow partials and the submission did not score full marks. Status becomes `D`.
11. The same transaction recomputes what depends on the submission: the user's points, performance points and
    solved count (public, non-organisation-private problems only), the problem's solver count and AC rate, and, if
    the submission belongs to a contest, the participation score through that contest's format. The judge's
    `currentSubmissionId` is cleared.
12. Every page showing any of that data updates: the submission page, the problem's submission list, the global
    submission list, the user's profile, the contest ranking and the hall scoreboard.

Step 12 is the reason there is no polling anywhere in MOJ. A page subscribes to a query, Convex tracks which
documents that query read, and a write to any of them pushes a new result. The contest ranking page and the hall
scoreboard are ordinary queries, so a verdict landing on a judge box in another building updates the projector in
the lecture theatre.

## Jobs and crons

Work that is too long for one mutation goes through the `jobs` table. `jobs.create(type, args)` inserts a row with
a progress object, then schedules the first chunk with `ctx.scheduler.runAfter`; each chunk does a bounded amount
of work, updates progress and schedules the next one. The staff console subscribes to the job document, so its
progress bar is live for the same reason everything else is.

`jobs.run` is the single entry point: it reads the row's type and schedules the runner that owns it. The types
are `rejudge`, `rescore`, `rescoreContest`, `rateContest`, `rejudgeContestProblem`, `moss`, `userExport`, `pdf`
and `sitemap`. The last two are marked done immediately, because the PDF and the sitemap are rendered by the web
app on request; the row exists only so the console can show one was asked for. MOSS needs an API key and reports
that it is not configured without one.

Four crons run: judge recovery every minute, marking judges offline when heartbeats stop every minute, clearing
stale contest mode every five minutes, and refreshing the language statistics snapshot every quarter of an hour.
