# MOJ runbook

How to run MOJ on your own machine, how to reset it, and what every environment
variable is for. For the architecture and the feature contract read
[SPEC.md](./SPEC.md).

## What you need

- Node 24 or newer and npm 11 (`node -v`, `npm -v`).
- Docker with the compose plugin (`docker compose version`).
- Nothing else. Postgres and the Convex backend both run in containers.

## First run

```sh
git clone git@github.com:MonashAPS/MOJ.git
cd MOJ
npm install
npm run setup
npm run dev
```

`npm run setup` is idempotent. It:

1. starts `postgres`, `convex-backend` and `convex-dashboard` from
   `infra/compose.dev.yml`,
2. waits for the backend to answer `/version`,
3. generates the Convex admin key,
4. writes `.env.local` at the repository root and a copy in `apps/web`, keeping
   any `AUTH_SECRET` that is already there so existing sessions survive,
5. runs the Drizzle migrations for the Better Auth database,
6. sets `AUTH_ISSUER`, `AUTH_JWKS_URL` and, when the container can reach the
   host, `AUTH_URL` on the Convex deployment (plus `LEGACY_SECRET_KEY` if one is
   in `.env.local`),
7. pushes the Convex functions,
8. seeds the 59 DMOJ languages, the navigation bar, the misc config defaults,
   the problem groups and types, two announcements and the sample problem
   `aplusb`,
9. creates the development superuser `admin` / `admin`, enrolled in TOTP against
   `MOJ_DEV_TOTP_SECRET` so it passes the staff two-factor gate.

Then:

| Service          | URL                       |
| ---------------- | ------------------------- |
| Web app          | http://localhost:3000     |
| Convex API       | http://127.0.0.1:3210     |
| Convex HTTP API  | http://127.0.0.1:3211     |
| Convex dashboard | http://127.0.0.1:6791     |
| Postgres         | `127.0.0.1:5433`, user `moj`, password `moj` |

`npm run dev` runs `convex dev` and `next dev` together with `concurrently`.
Convex watches `convex/` and pushes on save; Next watches `apps/web`.

## Accounts and mail

`MAIL_MODE=console` writes every activation and password reset mail to the
server console instead of sending it. The activation link is also shown on
`/accounts/register/complete/` when `NODE_ENV` is not `production`, so a fresh
install can be finished without a mail server.

The development superuser is `admin` / `admin`, email `admin@example.com`,
already verified, staff and superuser, with every DMOJ permission code. Change
the username, password or email with `MOJ_ADMIN_USERNAME`, `MOJ_ADMIN_PASSWORD`
and `MOJ_ADMIN_EMAIL` before running setup.

Staff accounts without a second factor are redirected to `/accounts/2fa/`
everywhere except the account pages, matching DMOJ's `DMOJ_REQUIRE_STAFF_2FA`.
The superuser is staff, so setup enrols it in TOTP as well, against the fixed
secret in `MOJ_DEV_TOTP_SECRET`. Fixed on purpose: the same secret always
produces the same codes, so a script or a test can generate one instead of
reaching for a phone.

Scan the provisioning URI setup prints (`totp otpauth://…`) with any
authenticator app, or generate a code with `otpauth`, which `apps/web` already
depends on:

```js
import { createOTP } from "@better-auth/utils/otp";
import { URI } from "otpauth";

const uri = createOTP(process.env.MOJ_DEV_TOTP_SECRET, { digits: 6, period: 30 })
  .url("MOJ", "admin@example.com");
const code = URI.parse(uri).generate();
```

Setup also issues five fixed scratch codes, `mojde-vcode1` through
`mojde-vcode5`, each good for one login in place of a code. Re-running
`npx tsx apps/web/scripts/create-admin.ts` reissues the set and repairs the
enrolment; it is idempotent.

**None of this belongs in production.** Setup is a development script and only
it writes `MOJ_DEV_TOTP_SECRET`; a deployment leaves the variable unset, and
without it `create-admin.ts` enrols nothing.

## The judge

The judge service is behind a compose profile so the stack comes up without it:

```sh
docker compose -f infra/compose.dev.yml --project-directory . --profile judge up -d judge
```

That service runs on host networking and pulls from `http://127.0.0.1:3211`.
A bridged container reaches the host through `host.docker.internal`, and a
Linux host that firewalls its bridge interface drops that traffic, so the
handshake never lands; host networking sidesteps it. Docker Desktop on macOS
and Windows has no host networking, so use the bridged service there:

```sh
docker compose -f infra/compose.dev.yml --project-directory . --profile judge-bridge up -d judge-bridge
```

Either way test data lives in `infra/problems/<code>`; only `aplusb` is
committed. `MOJ_JUDGE_URL`, `JUDGE_NAME` and `JUDGE_KEY` override the defaults.

## Resetting

Wipe everything, including both databases and all Convex data:

```sh
docker compose -f infra/compose.dev.yml --project-directory . down -v
rm -f .env.local apps/web/.env.local
npm run setup
```

Keep the data and only re-push the functions and the seed:

```sh
npx convex dev --once
npx convex run seed:run '{}'
```

Re-seed over the top of existing rows (overwrites languages and nav items,
leaves everything else alone):

```sh
npx convex run seed:run '{"force": true}'
```

Reset just the Better Auth database:

```sh
docker compose -f infra/compose.dev.yml --project-directory . exec postgres \
  psql -U moj -d postgres -c 'DROP DATABASE moj_auth' -c 'CREATE DATABASE moj_auth'
npm run db:migrate --workspace apps/web
```

## Environment variables

`npm run setup` writes these into `.env.local` (repository root) and
`apps/web/.env.local`. `infra/.env.example` documents the full set, including
the ones only production needs.

| Variable | Used by | What it is |
| --- | --- | --- |
| `CONVEX_SELF_HOSTED_URL` | Convex CLI | Admin endpoint of the backend, `http://127.0.0.1:3210` in dev. |
| `CONVEX_SELF_HOSTED_ADMIN_KEY` | Convex CLI | Key from `generate_admin_key.sh`. Full access to the deployment; never commit it. |
| `CONVEX_TMPDIR` | Convex CLI | Scratch directory on the same filesystem as the repo, so the bundler does not cross devices. |
| `NEXT_PUBLIC_CONVEX_URL` | browser, web server | Convex client API the app subscribes to. |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | judge, tooling | Convex HTTP actions (`/health`, and the judge API later). |
| `NEXT_PUBLIC_APP_URL` | web server | Public origin of the site. Better Auth builds links from it. |
| `DATABASE_URL` | web server | Postgres connection for Better Auth, through Drizzle. |
| `AUTH_SECRET` | web server | Signs sessions and cookies. Changing it logs everyone out. |
| `AUTH_ISSUER` | web server, Convex | `iss` claim on the JWTs Convex trusts. Must match on both sides. |
| `AUTH_JWKS_URL` | Convex | Where the backend fetches the public keys. See the note below. |
| `AUTH_RP_ID` | web server | Passkey relying party id. Bare hostname, no scheme or port. |
| `AUTH_URL` | Convex | Web app origin the problems API calls to verify an API key against Better Auth. Unset means the `apiKeys` table fallback. |
| `LEGACY_SECRET_KEY` | web server, Convex | DMOJ's `SECRET_KEY`. API v2 tokens minted by the old site are `hmac_sha256` of it, so legacy tokens only work when it matches. Blank on a fresh install. |
| `MOJ_DEV_TOTP_SECRET` | setup only | Fixed TOTP secret the development superuser is enrolled against, so its codes are reproducible. Development only; never set it on a deployment. |
| `MAIL_MODE` | web server | `console` logs mail, `ses` sends through Amazon SES. |
| `MAIL_FROM`, `SES_*` | web server | SES sender and credentials, only read when `MAIL_MODE=ses`. |
| `JUDGE_NAME`, `JUDGE_KEY` | judge container | Credentials the judge presents to the judge API. |
| `INSTANCE_NAME`, `INSTANCE_SECRET` | convex-backend | Deployment identity. `INSTANCE_SECRET` is 64 hex characters; the Postgres database name is `INSTANCE_NAME` with dashes replaced by underscores. |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_PORT` | postgres | Credentials and the host port (5433 by default). |
| `TYPST_BIN` | web server | Path to the Typst binary used to render problem PDFs. |

Four variables live on the Convex deployment as well as in `.env.local`, because
Convex functions read them at run time and `convex/auth.config.ts` at push time.
Setup sets them for you; check them with `npx convex env list`:

- `AUTH_ISSUER`
- `AUTH_JWKS_URL`
- `AUTH_URL`, only when the backend container can reach the host. When it cannot,
  setup removes it and `convex/http/problemsApi.ts` verifies problems-API keys
  against the `apiKeys` table instead, which is the same fallback a production
  deployment uses when the web app is briefly unreachable.
- `LEGACY_SECRET_KEY`, only when it is not blank.

### If the Convex container cannot reach the web app

Convex validates Better Auth's JWTs by fetching the JWKS from
`AUTH_JWKS_URL`, which by default points back at the dev server through
`host.docker.internal`. On most machines that works out of the box. If a host
firewall filters the Docker bridge (NixOS with the default `nixos-fw` rules, for
example) the fetch times out and every authenticated request stalls for 30
seconds and then falls back to being anonymous.

Setup detects this: it probes the backend container's ability to reach the host
and, when it cannot, inlines the key set as a `data:` URI in `AUTH_JWKS_URL`
instead of a URL. It leaves `AUTH_URL` unset in the same case, so the problems
API falls back to the `apiKeys` table rather than waiting on a fetch that cannot
succeed. You will see these lines in the setup output:

```
the convex container cannot reach the host, so the JWKS is inlined as a data URI
the convex container cannot reach the host, so AUTH_URL is left unset
```

The only cost is that rotating the Better Auth signing keys needs another
`npm run setup`, and that a problems-API key has to exist in the `apiKeys` table
rather than only in Better Auth. To go back to fetching the URL, open the
firewall for the Docker bridge subnet and re-run setup.

## Importing the production site

`tools/import` reads a `mysqldump` of the live DMOJ database and writes Convex
documents plus Better Auth rows. See `tools/import/README.md` for the options
and the table order; this is the sequence as it was actually run on the
development box.

The stack has to be up (`npm run setup`), the Drizzle migrations applied, and
`.env.local` has to carry `CONVEX_SELF_HOSTED_URL`, `CONVEX_SELF_HOSTED_ADMIN_KEY`,
`DATABASE_URL` and `AUTH_SECRET`. The importer reads them from `.env.local` on
its own.

```sh
# 1. the dump and the Django SECRET_KEY, both gitignored
scp maps:/srv/dumps/dump-2026-09-10.sql.gz tools/import/dump-2026-09-10.sql.gz
printf 'SECRET_KEY=%s\n' "$SECRET_KEY" > tools/import/secrets.env

# 2. dry run first, and read the report before going further
taskset -c 0-11,14-31 npm run import -w tools/import -- \
  --dump tools/import/dump-2026-09-10.sql.gz \
  --secret-key-file tools/import/secrets.env \
  --dry-run --report

# 3. the real load
taskset -c 0-11,14-31 npm run import -w tools/import -- \
  --dump tools/import/dump-2026-09-10.sql.gz \
  --secret-key-file tools/import/secrets.env \
  --report

# 4. rebuild the leaderboard aggregates (see below)
npx convex run rankings:rebuildAggregates '{}'

# 5. the legacy API v2 tokens only verify if the deployment has the same key
npx convex env set LEGACY_SECRET_KEY "$SECRET_KEY"
```

A run that stops part way can be resumed with `--resume`; `--fresh` forgets
`tools/import/out/state.json` and treats every table as unloaded. A run only
inserts, so re-importing a table that is already loaded duplicates it.

The 2026-09-10 dump loaded 747 profiles, 313 problems, 63 contests, 1533
participations, 14933 submissions, 236605 case rows, 18 comments, 12 tickets and
1812 revisions, plus 749 Postgres users with their Django password hashes
carried over verbatim.

### `rankings:rebuildAggregates` after an import

The leaderboard is served by three `@convex-dev/aggregate` components
(`profilesByPP`, `profilesByRating`, `profilesByProblemCount`). Convex has no
triggers, so every mutation that moves a profile's points maintains them by hand
through `rankings.patchProfile`. `importer.insertBatch` does the same for the
profiles it inserts, but an import that was interrupted, resumed, or run with
`--clear` can still leave the tree short of rows. Rebuilding is cheap and safe
to repeat:

```sh
npx convex run rankings:rebuildAggregates '{}'
```

It clears and refills in pages of 200 and returns `{cursor, isDone, done}`; call
it again with the cursor until `isDone`. Staff can do the same from the console
through `rankings.repairAggregates`, which does the whole table in one go.

## End to end: the judge

`npm run e2e:judge` submits `infra/problems/aplusb/sol.py` through the real
`submissions.submit` mutation and waits for `D`/`AC`. It needs the stack running
and a judge container polling it with the same name and key.

On this box the container has to run with `--network host`. The NixOS firewall
trusts only `lo`, so a container on the default bridge cannot reach the Convex
HTTP port through `host.docker.internal`, and every claim times out. With host
networking the judge reaches the port on `127.0.0.1` like everything else, which
is why `MOJ_URL` is a loopback address and not the gateway.

```sh
docker run --rm --network host \
  --cap-add SYS_PTRACE \
  -e MOJ_URL=http://127.0.0.1:3211 \
  -e JUDGE_NAME=local \
  -e JUDGE_KEY=localjudgekey \
  -v "$PWD/infra/problems:/problems" \
  moj-judge:tier1

# in another shell, once the judge has handshaken
taskset -c 0-11,14-31 npm run e2e:judge
```

`e2e:judge` creates the `judges` row with `sha256(key)` if it is not there
already, so the judge can be started before anything exists in the database. Set
`JUDGE_NAME` / `JUDGE_KEY` on the container and `MOJ_JUDGE_NAME` /
`MOJ_JUDGE_KEY` on the script if you use anything other
than the defaults, and `MOJ_E2E_TIMEOUT_MS` if a cold container needs longer
than 120 seconds to compile.

The compose stack has the judge behind a profile, but that service uses the
bridge network and will not grade on this box; use the `docker run` above
instead.

## Checks

```sh
npm run typecheck   # tsc over convex/, apps/web and packages/*
npm run lint        # biome check .
npm test            # vitest across every workspace
npm run build       # next build
```

On NixOS, Biome's prebuilt binary is dynamically linked against a generic Linux
loader and will not start. Run it through `steam-run`:

```sh
steam-run node_modules/.bin/biome check .
```

## Common problems

**`No CONVEX_DEPLOYMENT set`** — `.env.local` is missing or has no
`CONVEX_SELF_HOSTED_URL`. Run `npm run setup`.

**`Hex-decoded key was 31 bytes, not 32`** in the backend log — `INSTANCE_SECRET`
is not 64 hex characters.

**Backend logs `Connected to Postgres database: moj-dev` then exits** — the
database does not exist. It is created by
`infra/scripts/postgres-init/01-databases.sh`, which only runs the first time
the Postgres volume is created. Drop the volume (`down -v`) and start again.

**The site renders but nobody appears logged in** — the JWKS is unreachable from
the backend. See the section above, and check `npx convex env get AUTH_JWKS_URL`.

**Port 3000, 3210, 3211, 5433 or 6791 already in use** — something else is
running. `docker compose -f infra/compose.dev.yml --project-directory . ps` shows
what this stack has bound.
