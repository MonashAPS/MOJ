# Deployment

A production MOJ is the same four pieces as a development one, with Caddy in front of them for TLS. The site, the
Convex backend and Postgres run together on one box; judges run on their own boxes and reach the site over HTTPS.

Sizing, for a club-sized site: two cores and 4 GB of RAM is enough for the web box, and the disk is dominated by
the submissions table and the statement media. Judges want the fastest single-core performance you can get, since
a submission is graded by one process at a time, and enough RAM to hold the largest memory limit you allow plus
the sandbox.

The examples below use `example.org`. The club runs `judge.monashaps.com`.

## Compose

`infra/compose.prod.yml`:

```yaml
services:
  caddy:
    image: caddy:2
    restart: unless-stopped
    ports:
      - '80:80'
      - '443:443'
      - '443:443/udp'
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config
    depends_on:
      - web
      - convex-backend

  web:
    image: ghcr.io/monashaps/moj-web:latest
    restart: unless-stopped
    env_file: .env.prod
    depends_on:
      postgres:
        condition: service_healthy
      convex-backend:
        condition: service_started
    expose:
      - '3000'

  convex-backend:
    image: ghcr.io/get-convex/convex-backend:latest
    restart: unless-stopped
    environment:
      INSTANCE_NAME: moj
      INSTANCE_SECRET: ${INSTANCE_SECRET}
      CONVEX_CLOUD_ORIGIN: https://convex.example.org
      CONVEX_SITE_ORIGIN: https://convex-site.example.org
      POSTGRES_URL: postgres://moj:${POSTGRES_PASSWORD}@postgres:5432
      DO_NOT_REQUIRE_SSL: 'true'
    volumes:
      - convex-data:/convex/data
    depends_on:
      postgres:
        condition: service_healthy
    expose:
      - '3210'
      - '3211'

  postgres:
    image: postgres:17
    restart: unless-stopped
    environment:
      POSTGRES_USER: moj
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: convex
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./initdb:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U moj']
      interval: 5s
      timeout: 5s
      retries: 20

volumes:
  caddy-data:
  caddy-config:
  convex-data:
  postgres-data:
```

`initdb/01-auth-db.sql` creates the second database Better Auth uses:

```sql
CREATE DATABASE moj_auth OWNER moj;
```

Postgres is not published to the host. Nothing outside the compose network needs to reach it, and a database on
the public internet is a database that will be found.

```bash
docker compose -f infra/compose.prod.yml up -d
docker compose -f infra/compose.prod.yml ps
docker compose -f infra/compose.prod.yml logs -f web
```

## Caddy

`infra/Caddyfile`:

```
{
  email admin@example.org
}

example.org {
  encode zstd gzip
  reverse_proxy web:3000

  header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains"
    X-Content-Type-Options "nosniff"
    Referrer-Policy "strict-origin-when-cross-origin"
  }
}

convex.example.org {
  reverse_proxy convex-backend:3210
}

convex-site.example.org {
  reverse_proxy convex-backend:3211
}
```

Three names, because the browser talks to the cloud origin over a websocket and the judges talk to the site origin
over plain HTTPS, and both have to be reachable by name from outside. Caddy gets certificates for all three on its
own.

The websocket needs no special configuration in Caddy 2; `reverse_proxy` upgrades it. If you put something else in
front, such as Cloudflare, make sure websockets are enabled for the `convex.` hostname or the site will render once
and then never update.

## Environment

`.env.prod`, read by the web container. Keep it out of git; `infra/.env.prod.example` is the template.

| Variable | Example | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_CONVEX_URL` | `https://convex.example.org` | The cloud origin, used by the browser. |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | `https://convex-site.example.org` | The site origin, used for links to HTTP actions. |
| `CONVEX_DEPLOY_KEY` | generated | Lets `convex deploy` push functions to the self-hosted backend. |
| `INSTANCE_SECRET` | 64 hex characters | The Convex instance secret. Changing it invalidates the deployment. |
| `POSTGRES_PASSWORD` | generated | Used by both databases. |
| `DATABASE_URL` | `postgres://moj:...@postgres:5432/moj_auth` | Better Auth's database, through Drizzle. |
| `BETTER_AUTH_SECRET` | 32 random bytes | Signs sessions. Rotating it signs everyone out. |
| `BETTER_AUTH_URL` | `https://example.org` | The site's public origin. |
| `AUTH_ISSUER` | `https://example.org` | The JWT issuer Convex trusts. Has to match `convex/auth.config.ts`. |
| `AUTH_RP_ID` | `example.org` | The WebAuthn relying party id. Changing it invalidates every passkey. |
| `SES_REGION`, `SES_ACCESS_KEY_ID`, `SES_SECRET_ACCESS_KEY`, `SES_FROM` | | Outgoing email. Without them, email is logged instead of sent, which is not what you want in production. |
| `TYPST_BIN` | `/usr/local/bin/typst` | Only needed if the binary is not on `PATH` in the image. |
| `SITE_NAME`, `SITE_LONG_NAME` | `MOJ`, `the MAPS Online Judge` | Used in titles and feeds. |

Generate the secrets on the box:

```bash
openssl rand -hex 32   # INSTANCE_SECRET
openssl rand -base64 32  # BETTER_AUTH_SECRET
openssl rand -base64 24  # POSTGRES_PASSWORD
```

## First deploy

```bash
# 1. bring up the infrastructure
docker compose -f infra/compose.prod.yml up -d postgres convex-backend

# 2. generate an admin key for the backend and push the functions
docker compose -f infra/compose.prod.yml exec convex-backend \
  ./generate_admin_key.sh
export CONVEX_SELF_HOSTED_URL=https://convex.example.org
export CONVEX_SELF_HOSTED_ADMIN_KEY=...
npx convex deploy

# 3. run the auth migrations
npm run db:migrate

# 4. seed languages, navigation and configuration
npm run seed

# 5. start the rest
docker compose -f infra/compose.prod.yml up -d
```

Then create your own account through `/accounts/register/`, promote it in the database once, and do everything
else from the staff console.

If you are migrating an existing DMOJ site, do [the import](/admin/import) in place of steps 3 and 4, and skip
creating an account: yours came across with the rest.

## Backups

Two things need backing up and they are backed up differently. Convex holds the site's data; Postgres holds the
authentication tables and, underneath, the Convex storage. A Convex export is the portable one, and a `pg_dump` is
the fast one.

`/usr/local/bin/moj-backup`:

```bash
#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR=/var/backups/moj
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
KEEP_DAYS=30

mkdir -p "$BACKUP_DIR"

# Convex: a portable snapshot of every table, restorable with `convex import`.
CONVEX_SELF_HOSTED_URL=https://convex.example.org \
CONVEX_SELF_HOSTED_ADMIN_KEY=$(cat /etc/moj/convex-admin-key) \
  npx convex export --path "$BACKUP_DIR/convex-$STAMP.zip"

# Postgres: both databases, including the Convex storage tables.
docker compose -f /srv/moj/infra/compose.prod.yml exec -T postgres \
  pg_dumpall -U moj | gzip > "$BACKUP_DIR/postgres-$STAMP.sql.gz"

# Statement images and other uploads.
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
# Convex, table by table or all at once
npx convex import --replace "$BACKUP_DIR/convex-20260910T033000Z.zip"

# Postgres, into an empty instance
gunzip -c "$BACKUP_DIR/postgres-20260910T033000Z.sql.gz" \
  | docker compose -f infra/compose.prod.yml exec -T postgres psql -U moj
```

Test a restore into a scratch environment at least once a term. An untested backup is a hope.

Judges need no backup. Their state is the problem data, which comes from the problem repositories, and rebuilding
one is a `docker run` away.

## Updating

```bash
cd /srv/moj
git pull
docker compose -f infra/compose.prod.yml pull
npx convex deploy            # push function and schema changes first
npm run db:migrate           # apply any Better Auth migrations
docker compose -f infra/compose.prod.yml up -d
```

The order matters. Convex functions are deployed before the new web image starts, because the new pages expect the
new functions; a schema change that removes a field should be split across two releases so that the running site
never queries a field that has gone.

Judges are updated separately and do not need to match the site's version:

```bash
docker pull ghcr.io/monashaps/moj-judge:tier1
docker stop moj-judge && docker rm moj-judge
docker run -d ... ghcr.io/monashaps/moj-judge:tier1   # the same command as before
```

Do that one judge at a time. With several judges online, the others keep grading, and a judge that goes away
mid-submission has its work requeued by the recovery cron within a minute.

Never update a judge during a contest. A restart puts the judge through a fresh handshake, which reindexes the
problem directory, and on a large problem set that is a minute where that judge is not grading.

## Migrating the judge box

Judges hold no state worth keeping, so a migration is a new judge rather than a move.

1. Build the new box and install Docker.
2. Copy the problem data to it: `rsync -avz --delete old-judge:~/problems/ /srv/problems/`. Or point the problem
   repositories at it and let CI populate it, which is better, because then the new box is in the deploy path
   permanently.
3. Create a **new** judge record in the staff console with its own name and key, rather than reusing the old one.
   Two judges with the same name will fight.
4. Start the container on the new box and check it appears on `/status/`.
5. Watch it grade something. Submit to a problem you know it has.
6. Disable the old judge in the staff console. Disabling stops new work reaching it while letting it finish what it
   has.
7. When it is idle, stop the container and delete the old judge record.

If you are replacing rather than adding, do steps 1 to 5 before step 6, so there is never a moment with no judge
online. A site with no online judge queues submissions rather than failing them, but a contest with a queue is a
contest with an audience watching a spinner.

To move a judge between tiers, edit its tier in the staff console. It takes effect on the next claim, no restart
needed.
