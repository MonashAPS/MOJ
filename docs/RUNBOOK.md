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
6. sets `AUTH_ISSUER` and `AUTH_JWKS_URL` on the Convex deployment,
7. pushes the Convex functions,
8. seeds the 59 DMOJ languages, the navigation bar, the misc config defaults,
   the problem groups and types, two announcements and the sample problem
   `aplusb`,
9. creates the development superuser `admin` / `admin`.

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

## The judge

The judge service is behind a compose profile so the stack comes up without it:

```sh
docker compose -f infra/compose.dev.yml --project-directory . --profile judge up -d judge
```

It needs `apps/judge/Dockerfile`, which the judge agent builds. Test data lives
in `infra/problems/<code>`; only `aplusb` is committed.

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
| `MAIL_MODE` | web server | `console` logs mail, `ses` sends through Amazon SES. |
| `MAIL_FROM`, `SES_*` | web server | SES sender and credentials, only read when `MAIL_MODE=ses`. |
| `JUDGE_NAME`, `JUDGE_KEY` | judge container | Credentials the judge presents to the judge API. |
| `INSTANCE_NAME`, `INSTANCE_SECRET` | convex-backend | Deployment identity. `INSTANCE_SECRET` is 64 hex characters; the Postgres database name is `INSTANCE_NAME` with dashes replaced by underscores. |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_PORT` | postgres | Credentials and the host port (5433 by default). |
| `TYPST_BIN` | web server | Path to the Typst binary used to render problem PDFs. |

Two variables live on the Convex deployment rather than in `.env.local`, because
`convex/auth.config.ts` reads them at push time. Setup sets them for you; check
them with `npx convex env list`:

- `AUTH_ISSUER`
- `AUTH_JWKS_URL`

### If the Convex container cannot reach the web app

Convex validates Better Auth's JWTs by fetching the JWKS from
`AUTH_JWKS_URL`, which by default points back at the dev server through
`host.docker.internal`. On most machines that works out of the box. If a host
firewall filters the Docker bridge (NixOS with the default `nixos-fw` rules, for
example) the fetch times out and every authenticated request stalls for 30
seconds and then falls back to being anonymous.

Setup detects this: it probes the backend container's ability to reach the host
and, when it cannot, inlines the key set as a `data:` URI in `AUTH_JWKS_URL`
instead of a URL. You will see this line in the setup output:

```
the convex container cannot reach the host, so the JWKS is inlined as a data URI
```

The only cost is that rotating the Better Auth signing keys needs another
`npm run setup`. To go back to fetching the URL, open the firewall for the
Docker bridge subnet and re-run setup.

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
