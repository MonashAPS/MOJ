# Deployment

A production MOJ is the same pieces as a development one, with Caddy in front of them for TLS. The site, the
Convex backend and Postgres run together on one box; judges run on their own boxes and reach the site over HTTPS.

Sizing, for a small site: two cores and 4 GB of RAM is enough for the web box, and the disk is dominated by the
submissions table, the statement media and the test data the site now stores for each problem. Budget for your
problem repositories compressed, with room to spare while a replacement archive is written. Judges want the fastest single-core performance you can get, since
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

`apps/web/Dockerfile` builds the workspace in stages and runs Next's standalone output on Node 24 as a non-root
user. It carries a pinned Typst release for the architecture you build on, the statement templates, and the fonts
Typst falls back to, so `/problem/<code>/pdf` works in the container. `/api/health` is what the image's own
healthcheck asks.

::: warning
The `NEXT_PUBLIC_*` values are compiled into the client bundle, so they are build arguments as well as
environment. `compose.prod.yml` passes them from `MOJ_DOMAIN`; rebuild the image, not just restart it, after
changing the domain.
:::

Everything is driven by one variable, `MOJ_DOMAIN`. Caddy serves four names derived from it, and the compose file
builds every origin the app and the judge need from the same value:

| Hostname | Serves |
| --- | --- |
| `judge.example.org` | The web app. |
| `convex.judge.example.org` | The Convex cloud origin, which is the websocket the browser subscribes on. |
| `convex-site.judge.example.org` | The Convex site origin: the judge protocol, and the problems API that the site also proxies. |
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
| `MAIL_MODE` | `ses` | Which transport sends the site's mail: `console`, `ses` or `smtp`. See [mail](#mail). |
| `MAIL_FROM` | `noreply@judge.example.org` | The envelope sender. On SES this address or its domain has to be verified. |
| `SES_REGION`, `SES_ACCESS_KEY_ID`, `SES_SECRET_ACCESS_KEY` | | SES credentials, read when `MAIL_MODE=ses`. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` | | SMTP relay, read when `MAIL_MODE=smtp`. |
| `HIBP_CHECK` | | `off` skips the breached-password check, for an install with no outbound network. |
| `BAD_MAIL_PROVIDERS`, `BAD_MAIL_PROVIDER_REGEX` | | Extra disposable-email domains and patterns to refuse at sign-up, on top of the built-in list. |
| `TYPST_BIN` | `typst` | The Typst binary used to render problem PDFs, if it is not on `PATH`. The web image ships one and sets this itself. |
| `TYPST_TEMPLATE_DIR`, `TYPST_FONT_PATHS` | | Where the statement templates and the fonts are, if they are not beside the installed `@moj/content` and in the system font directories. The web image sets both. |
| `MOJ_MEDIA_ROOT` | `/srv/media` | Where statement uploads imported from an old site are served from, at `/media/...`. |
| `JUDGE_NAME`, `JUDGE_KEY` | | Only needed if you run the bundled judge service. |
| `RUST_LOG` | `info` | The Convex backend's log level. |

The compose file sets `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL`, `NEXT_PUBLIC_APP_URL`,
`AUTH_ISSUER`, `AUTH_JWKS_URL`, `AUTH_RP_ID` and `DATABASE_URL` from `MOJ_DOMAIN` and the Postgres credentials, so
they are not yours to set. Set `NEXT_PUBLIC_SITE_URL` only if the feeds and the sitemap should use a different
absolute origin from the one the app is served on.

### Mail

Every message the site sends -- account activation, password reset, email change and the two-factor notices --
goes out through one transport, and `MAIL_MODE` picks it.

| `MAIL_MODE` | What it does | What it needs |
| --- | --- | --- |
| `console` | Writes the message to the server's log instead of sending it. | Nothing. The default, and what development runs on. |
| `ses` | Sends through Amazon SES. | `SES_REGION`, and either both of `SES_ACCESS_KEY_ID` and `SES_SECRET_ACCESS_KEY` or neither. |
| `smtp` | Sends through any SMTP server. | `SMTP_HOST`, and optionally `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER` and `SMTP_PASSWORD`. |

`MAIL_FROM` is the envelope sender in every mode. On SES it, or its domain, has to be a verified identity, and the
account has to be out of the sandbox or nothing reaches an unverified recipient.

With no `SES_ACCESS_KEY_ID` and no `SES_SECRET_ACCESS_KEY`, the SES client falls back to the AWS SDK's own
credential chain, which is how an instance role or a mounted profile is meant to be picked up. Set both or
neither; one alone is refused at start-up.

For SMTP, the port defaults to 587 and 465 implies implicit TLS; anything else starts in the clear and upgrades
with STARTTLS. `SMTP_SECURE=true` or `false` overrides that guess for a server that disagrees. Set the user and
the password together, or leave both unset for a relay that does not authenticate.

A misconfigured transport fails loudly on the first send rather than dropping the message, and the next send
rebuilds it, so fixing the variables and restarting is enough.

::: tip
Whatever you choose, send yourself a password reset before announcing the site. Mail that does not arrive looks
exactly like a site that does not work: nobody can activate an account.
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

### Test data

The site stores the test data for every problem a repository has published it for: one zip in Convex file storage,
and one row naming its sha256, its size, its file count, who published it and when. Judges download that archive
rather than reading a local disk, so a problem's data is now the site's state as much as the repository's.

The script above already covers it. The blobs live in Convex storage, which this stack backs with Postgres, so the
`convex export` carries the archives and the `pg_dumpall` carries what sits underneath. Two consequences:

- the export grows by about the total size of every problem's data. On a large problem set, time the nightly run
  and check the disk it writes to before assuming the defaults still fit;
- the archives are reproducible. The uploader builds them deterministically, so re-running a repository's publish
  workflow puts back byte-identical data, and losing them costs a CI run rather than a problem set.

Publishing replaces rather than accumulates: the previous archive is deleted once the new one is recorded, so the
storage holds one per problem and not a history. If you want a history, that is what the repository's git log is.

Judges still need no backup. A judge holds a cache of archives it has downloaded, which refills itself on the next
submission, plus whatever problem data was put on the box directly, which comes from the repositories. Rebuilding
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
2. There is nothing to copy for a problem whose data the site holds: the new judge downloads it the first time it
   grades that problem. For data that lives only on the old box, either copy it across with
   `rsync -avz --delete old-judge:~/problems/ /srv/problems/`, or publish it from its repository and let the site
   hand it out, which takes the new box out of the deploy path for good.
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
