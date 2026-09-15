# Architecture

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

- **`apps/web`** — Next.js App Router on React 19. A page is a server component that `fetchQuery`s for the first
  render and hands the result to a client component that subscribes with `useQuery`; long lists use
  `usePaginatedQuery`.
- **Convex** — database, query layer and scheduler in one self-hosted process, storing its data in Postgres. The
  cloud origin serves the browser; the site origin serves the HTTP actions in `convex/http/`.
- **Better Auth** — sessions, passwords, two-factor secrets, passkeys and API keys, with Drizzle over Postgres.
  Convex stores no credentials: it trusts an RS256 JWT carrying `{sub, username, isStaff}`, registered by
  `convex/auth.config.ts` as a `customJwt` provider. It also verifies Django's
  `pbkdf2_sha256$<iterations>$<salt>$<hash>`, rewriting a legacy hash on the first sign-in.
- **`packages/core`** — pure functions: permissions, contest formats, ratings, points, verdicts, freeze logic.
- **`packages/content`** — remark and rehype with DMOJ's sanitiser presets, KaTeX, Shiki, markdown to Typst.
- **`apps/judge`** — DMOJ's judge-server as a git subtree, with `dmoj/moj_packet.py` and `dmoj/moj_data.py`
  added and a `MojJudge` selected when `MOJ_URL` is set.

## What replaced what

| DMOJ | MOJ |
| --- | --- |
| Django and gunicorn | Next.js App Router on React 19 |
| MySQL through the Django ORM | Convex, self-hosted, with Postgres underneath |
| The bridge daemon on TCP 9999 | The pull protocol over HTTPS |
| The websocket event daemon | Convex subscriptions |
| Celery workers | The `jobs` table and the Convex scheduler |
| `pdfoid`, `mathoid`, `texoid` | The Typst binary with vendored packages |
| Redis | Nothing; Convex holds the queue and the aggregates |
| Django auth with Fernet columns | Better Auth with Drizzle on Postgres |
| Pygments | Shiki |
| The Django admin | The staff console at `/admin/` |

## The judge protocol

Every call carries `{judgeName, judgeKey}`; the server compares `sha256(key)` against `judges.authKeyHash`.

| Call | Interval | What it does |
| --- | --- | --- |
| `POST /judge/handshake` | once, retried with backoff to 60 s | Reports problem codes and executors; marks the judge online. |
| `POST /judge/heartbeat` | 10 s | Current load. |
| `POST /judge/claim` | 500 ms while idle | Asks for one submission; `null` when there is none. |
| `GET /judge/data` | on demand | The archive, with `X-Moj-Data-Hash` and `X-Moj-Data-Size`. 404 for nothing stored, 409 for a stale hash. |
| `POST /judge/event` | per packet | `grading-begin`, `batch-begin`, `test-case-status`, `batch-end`, `grading-end`, `compile-error`, `compile-message`, `internal-error`, `submission-terminated`. |
| `GET /judge/abort` | 1 s while grading | Whether the submission was aborted. |
| `POST /judge/disconnect` | on shutdown | Clean shutdown. |

Candidates are `QU` submissions ordered by priority then date, priority being 0 in contest, 1 normal, 2 rejudge,
3 batch rejudge. Only judges in the lowest online tier claim; a judge claims only a submission whose language it
reported and whose problem it reported **or** the site holds data for; `judgePin` sends one to a named judge; and
rejudge priorities are skipped while the tier is busy.

`problemDataHash` on the claim is the sha256 of the archive the site holds, or `null`. Non-null means the judge
grades the site's copy, fetching it once, verifying it, and caching it under `MOJ_DATA_CACHE`
(`/judge-data-cache`, capped by `MOJ_DATA_MAX_GB`, 20 by default, evicted least-recently-used). The site's copy
wins wherever both exist. A cron requeues submissions in `P` or `G` whose judge has not sent a heartbeat for 60
seconds, or which have made no case progress for 15 minutes, once; a second failure is an internal error.

## Jobs and crons

`jobs.create(type, args)` inserts a row with a progress object and schedules the first chunk; each chunk does a
bounded amount of work and schedules the next. The types are `rejudge`, `rescore`, `rescoreContest`,
`rateContest`, `rejudgeContestProblem`, `moss`, `userExport`, `pdf` and `sitemap`; the last two are marked done
immediately, because the web app renders them on request.

Four crons run: judge recovery and offline marking every minute, clearing stale contest mode every five minutes,
and refreshing the language statistics every quarter hour.

Counts and ranks that would mean scanning a table use `@convex-dev/aggregate`, which has no triggers, so every
write that moves a profile's points maintains them by hand and a bulk load is followed by
`rankings:rebuildAggregates`. Rate limits use `@convex-dev/rate-limiter`.
