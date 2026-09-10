# Deployment

A production MOJ is the same pieces as a development one, with Caddy in front of them for TLS. The site, the
Convex backend and Postgres run together on one box; judges run on their own boxes and reach the site over HTTPS.

Sizing, for a club-sized site: two cores and 4 GB of RAM is enough for the web box, and the disk is dominated by
the submissions table and the statement media. Judges want the fastest single-core performance you can get, since
a submission is graded by one process at a time, and enough RAM to hold the largest memory limit you allow plus
the sandbox.

The examples below use `judge.example.org`.

## The stack

`infra/compose.prod.yml` defines six services:

| Service | What it is |
| --- | --- |
| `caddy` | TLS and the reverse proxy. The only thing bound to a host port. |
| `postgres` | Both databases. Not published to the host. |
| `convex-backend` | The Convex deployment, on its two origins. |
| `convex-dashboard` | The Convex dashboard, behind its own hostname. |
| `web` | The Next.js app, built from `apps/web/Dockerfile`. |
| `judge` | A judge on the same box, behind the `judge` compose profile so it is opt-in. |

::: warning
`apps/web/Dockerfile` is not in the repository yet, so the `web` service cannot be built as the file stands. Add
one, or replace the service's `build:` block with an `image:` you build elsewhere, before deploying.
:::

Everything is driven by one variable, `MOJ_DOMAIN`. Caddy serves four names derived from it, and the compose file
builds every origin the app and the judge need from the same value:

| Hostname | Serves |
| --- | --- |
| `judge.example.org` | The web app. |
| `convex.judge.example.org` | The Convex cloud origin, which is the websocket the browser subscribes on. |
| `convex-site.judge.example.org` | The Convex site origin: the judge protocol and the problems API. |
| `dashboard.judge.example.org` | The Convex dashboard. |

Three of those have to be reachable from outside: the browser talks to the app and to the cloud origin, and judges
talk to the site origin. Caddy gets certificates for all of them on its own.

The websocket needs no special configuration in Caddy 2; `reverse_proxy` upgrades it. If you put something else in
front, such as a CDN, make sure websockets are enabled for the `convex.` hostname or the site will render once and
then never update.

Restrict the dashboard hostname, or drop the service. It is full read and write access to the database.

## Environment

`infra/.env.example` documents the full set. Copy it to `.env.prod`, keep it out of git, and pass it with
`--env-file`.

| Variable | Example | Purpose |
| --- | --- | --- |
| `MOJ_DOMAIN` | `judge.example.org` | The one name everything else is derived from. Required. |
| `CADDY_EMAIL` | `admin@example.org` | The address Let's Encrypt is registered with. |
| `POSTGRES_USER`, `POSTGRES_PASSWORD` | | Postgres credentials. Required. |
| `CONVEX_DATABASE` | `moj_prod` | Convex's backing database. The backend derives the name from `INSTANCE_NAME` with dashes replaced by underscores, so the two have to agree. |
| `AUTH_DATABASE` | `moj_auth` | Better Auth's database. |
| `INSTANCE_NAME` | `moj-prod` | The Convex deployment's identity. |
| `INSTANCE_SECRET` | 64 hex characters | The Convex instance secret. Changing it on an existing deployment makes the stored data unreadable. |
| `CONVEX_IMAGE_TAG` | `latest` | The Convex backend and dashboard image tag. Pin it. |
| `AUTH_SECRET` | 32 random bytes | Signs sessions and cookies, and encrypts stored two-factor secrets. Rotating it signs everyone out and invalidates stored TOTP secrets. |
| `LEGACY_SECRET_KEY` | | The imported site's Django `SECRET_KEY`, so API tokens minted there keep verifying. Leave blank if you did not import. |
| `MAIL_MODE` | `console` | `console` logs mail to stdout; `ses` is the intended production transport. |
| `MAIL_FROM`, `SES_REGION`, `SES_ACCESS_KEY_ID`, `SES_SECRET_ACCESS_KEY` | | Outgoing mail. |
| `HIBP_CHECK` | | `off` skips the breached-password check, for an install with no outbound network. |
| `BAD_MAIL_PROVIDERS`, `BAD_MAIL_PROVIDER_REGEX` | | Extra disposable-email domains and patterns to refuse at sign-up, on top of the built-in list. |
| `TYPST_BIN` | `typst` | The Typst binary used to render problem PDFs, if it is not on `PATH`. |
| `MOJ_MEDIA_ROOT` | `/srv/media` | Where statement uploads imported from an old site are served from, at `/media/...`. |
| `JUDGE_NAME`, `JUDGE_KEY` | | Only needed if you run the bundled judge service. |
| `RUST_LOG` | `info` | The Convex backend's log level. |

The compose file sets `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL`, `NEXT_PUBLIC_APP_URL`,
`AUTH_ISSUER`, `AUTH_JWKS_URL`, `AUTH_RP_ID` and `DATABASE_URL` from `MOJ_DOMAIN` and the Postgres credentials, so
they are not yours to set. Set `NEXT_PUBLIC_SITE_URL` only if the feeds and the sitemap should use a different
absolute origin from the one the app is served on.

::: warning
Mail is not sendable yet. `MAIL_MODE=ses` refuses to start the transport, so a production install currently runs
with `MAIL_MODE=console` and activation, reset and email-change links appear in the web container's log. Until an
SES transport is wired in, plan for that: it means account activation has to be walked through by hand.
:::

Generate the secrets on the box:

```bash
openssl rand -hex 32      # INSTANCE_SECRET
openssl rand -base64 32   # AUTH_SECRET
openssl rand -base64 24   # POSTGRES_PASSWORD
```

## First deploy

Run compose from the repository root, so the relative paths in the file resolve.

```bash
# 1. the infrastructure
docker compose -f infra/compose.prod.yml --project-directory . --env-file .env.prod \
  up -d postgres convex-backend

# 2. an admin key for the backend
docker compose -f infra/compose.prod.yml --project-directory . \
  exec convex-backend ./generate_admin_key.sh

export CONVEX_SELF_HOSTED_URL=https://convex.judge.example.org
export CONVEX_SELF_HOSTED_ADMIN_KEY='moj-prod|01ab...'

# 3. push the functions
npx convex deploy

# 4. tell the deployment where to verify tokens
npx convex env set AUTH_ISSUER https://judge.example.org
npx convex env set AUTH_JWKS_URL https://judge.example.org/api/auth/jwks
npx convex env set AUTH_URL https://judge.example.org

# 5. the Better Auth tables
DATABASE_URL=... npm run db:migrate -w apps/web

# 6. seed languages, navigation and configuration
npx convex run seed:run '{}'

# 7. everything else
docker compose -f infra/compose.prod.yml --project-directory . --env-file .env.prod up -d
```

The admin key contains a `|`. Quote it, or the shell will try to run half of it as a pipeline.

Step 4 is what makes signing in work. The Convex backend validates the app's JWTs by fetching the key set from
`AUTH_JWKS_URL`, so it has to be a URL the backend container can reach. `AUTH_URL` is how the problems API
verifies an API key against Better Auth; leave it unset and the API falls back to the key table, which is a
reasonable state to be in but means a key has to exist there.

The problems API builds statement image links from the deployment's own `CONVEX_SITE_URL`, which the backend
takes from `CONVEX_SITE_ORIGIN`. If uploaded images come back as relative links, that is the value to check with
`npx convex env list`.

Then register through `/accounts/register/`, promote that account in the database once, and do everything else
from the staff console. If you are migrating an existing DMOJ site, do [the import](/admin/import) in place of
steps 5 and 6, and skip creating an account: yours came across with the rest.

## Branding

Nothing about the site's identity is compiled in. Once the stack is up, a superuser sets the site name, the long
name, the wordmark, the favicon, the accent and nav colours, the default theme and a block of custom CSS from
`/admin/config/branding`. The shell reads those on each request and emits them as CSS variables, so the token file
stays the source of the defaults and an empty field falls back to it.

`npm run setup` seeds the names from `MOJ_SITE_NAME` and `MOJ_SITE_LONG_NAME` when they are set, which is worth
doing so that the first page anyone sees is not called MOJ. Everything else is a form.

Different fonts are `@font-face` rules in the custom CSS. There is no font setting.

## Backups

Two things need backing up and they are backed up differently. Convex holds the site's data; Postgres holds the
authentication tables and, underneath, Convex's own storage. A Convex export is the portable one, and a
`pg_dumpall` is the fast one. Take both.

`/usr/local/bin/moj-backup`:

```bash
#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR=/var/backups/moj
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
KEEP_DAYS=30

mkdir -p "$BACKUP_DIR"

# Convex: a portable snapshot of every table, restorable with `convex import`.
CONVEX_SELF_HOSTED_URL=https://convex.judge.example.org \
CONVEX_SELF_HOSTED_ADMIN_KEY=$(cat /etc/moj/convex-admin-key) \
  npx convex export --path "$BACKUP_DIR/convex-$STAMP.zip"

# Postgres: both databases, including the tables Convex stores its data in.
docker compose -f /srv/moj/infra/compose.prod.yml --project-directory /srv/moj exec -T postgres \
  pg_dumpall -U moj | gzip > "$BACKUP_DIR/postgres-$STAMP.sql.gz"

# Statement images imported from an old site.
tar czf "$BACKUP_DIR/media-$STAMP.tar.gz" -C /srv/moj/infra media

find "$BACKUP_DIR" -type f -mtime +"$KEEP_DAYS" -delete
```

Run it nightly:

```bash
sudo tee /etc/systemd/system/moj-backup.service > /dev/null <<'UNIT'
[Unit]
Description=MOJ nightly backup

[Service]
Type=oneshot
ExecStart=/usr/local/bin/moj-backup
UNIT

sudo tee /etc/systemd/system/moj-backup.timer > /dev/null <<'UNIT'
[Unit]
Description=MOJ nightly backup

[Timer]
OnCalendar=*-*-* 03:30:00
Persistent=true

[Install]
WantedBy=timers.target
UNIT

sudo systemctl enable --now moj-backup.timer
```

Copy the directory somewhere else. A backup on the same disk as the database is not a backup.

Restoring:

```bash
# Convex, all at once
npx convex import --replace "$BACKUP_DIR/convex-20260910T033000Z.zip"

# Postgres, into an empty instance
gunzip -c "$BACKUP_DIR/postgres-20260910T033000Z.sql.gz" \
  | docker compose -f infra/compose.prod.yml --project-directory . exec -T postgres psql -U moj
```

After restoring Convex data in bulk, rebuild the leaderboard aggregates, because they are maintained by the
mutations that write points and a bulk load bypasses them:

```bash
npx convex run rankings:rebuildAggregates '{}'
```

Test a restore into a scratch environment at least once a term. An untested backup is a hope.

Judges need no backup. Their state is the problem data, which comes from the problem repositories, and rebuilding
one is a `docker run` away.

## Updating

```bash
cd /srv/moj
git pull
docker compose -f infra/compose.prod.yml --project-directory . --env-file .env.prod pull
npx convex deploy                 # push function and schema changes first
npm run db:migrate -w apps/web    # apply any Better Auth migrations
docker compose -f infra/compose.prod.yml --project-directory . --env-file .env.prod up -d
```

The order matters. Convex functions are deployed before the new web image starts, because the new pages expect the
new functions; a schema change that removes a field should be split across two releases so that the running site
never queries a field that has gone.

Judges are updated separately and do not need to match the site's version:

```bash
docker build --build-arg TIER=tier1 -t moj-judge:tier1 apps/judge
docker stop moj-judge && docker rm moj-judge
docker run -d ... moj-judge:tier1   # the same command as before
```

Do that one judge at a time. With several judges online, the others keep grading, and a judge that goes away
mid-submission has its work requeued by the recovery cron within a minute.

Never update a judge during a contest. A restart puts the judge through a fresh handshake, which reindexes the
problem directory, and on a large problem set that is a minute where that judge is not grading.

## Migrating the judge box

Judges hold no state worth keeping, so a migration is a new judge rather than a move.

1. Build the new box and install Docker.
2. Copy the problem data to it: `rsync -avz --delete old-judge:~/problems/ /srv/problems/`. Better still, point
   the problem repositories at it and let CI populate it, so the new box is in the deploy path permanently.
3. Create a **new** judge in the staff console with its own name and key, rather than reusing the old one. Two
   judges with the same name will fight.
4. Start the container on the new box and check it appears on `/status/`.
5. Watch it grade something. Submit to a problem you know it has.
6. Disable the old judge in the staff console. Disabling stops new work reaching it while letting it finish what
   it has.
7. When it is idle, stop the container and delete the old judge.

If you are replacing rather than adding, do steps 1 to 5 before step 6, so there is never a moment with no judge
online. A site with no online judge queues submissions rather than failing them, but a contest with a queue is a
contest with an audience watching a spinner.

To move a judge between tiers, edit its tier in the staff console. It takes effect on the next claim, with no
restart.
