# Production

`infra/compose.prod.yml` runs the published images behind Caddy, which terminates TLS. Run everything below from
the repository root, because the compose file's paths are relative to it. The examples use `judge.example.org`.

## Requirements

| Requirement | Value |
| --- | --- |
| Docker Engine with the Compose plugin | 24 or later |
| Node with npm, on the same box | 24 or later |
| A checkout of this repository | It carries the compose file, the Caddyfile and the migrations |
| Web box | 2 cores, 4 GB RAM minimum |
| Open ports | 80 and 443, TCP and UDP |

Judges run on their own boxes, need only outbound HTTPS, and want single-core speed and enough RAM for the
largest memory limit you allow.

## DNS

Four names derived from `MOJ_DOMAIN`, all pointing at the web box. Caddy gets certificates for them itself.

| Hostname | Serves |
| --- | --- |
| `judge.example.org` | The site |
| `convex.judge.example.org` | The client API the browser subscribes on |
| `convex-site.judge.example.org` | The judge and problems API |
| `dashboard.judge.example.org` | The database dashboard |

::: danger
Restrict the `dashboard.` name or drop the `convex-dashboard` service. It is full read and write access to the
database.
:::

## Environment

Copy `infra/.env.example` to `.env.prod`, keep it out of git, and pass it with `--env-file`.

| Variable | Purpose |
| --- | --- |
| `MOJ_DOMAIN` | Required, e.g. `judge.example.org`. Every origin derives from it. |
| `CADDY_EMAIL` | Registers the TLS certificates. |
| `POSTGRES_USER`, `POSTGRES_PASSWORD` | Required. |
| `INSTANCE_NAME` | The deployment's identity, e.g. `moj-prod`. |
| `INSTANCE_SECRET` | Required, 64 hex characters. Changing it makes stored data unreadable. |
| `CONVEX_DATABASE` | `INSTANCE_NAME` with dashes as underscores, e.g. `moj_prod`. |
| `AUTH_DATABASE` | The account database, e.g. `moj_auth`. |
| `AUTH_SECRET` | Required, 32 random bytes. Rotating it signs everyone out. |
| `CONVEX_IMAGE_TAG` | Backend and dashboard tag. Pin it. |
| `MOJ_IMAGE_TAG` | Which release `web` and `judge` run, e.g. `1.4.4`. |
| `JUDGE_TIER` | Runtimes tier of the bundled judge image, e.g. `tier1`. |
| `JUDGE_NAME`, `JUDGE_KEY` | Only for the bundled `judge` service. |
| `LEGACY_SECRET_KEY` | An imported site's `SECRET_KEY`, so its API tokens keep verifying. |
| `MAIL_MODE`, `MAIL_FROM` | `console`, `ses` or `smtp`. On SES the sender must be a verified identity. |
| `SES_REGION`, `SES_ACCESS_KEY_ID`, `SES_SECRET_ACCESS_KEY` | For `ses`. Set the key and secret together or neither. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` | For `smtp`. Port 587 by default; 465 implies implicit TLS. |
| `HIBP_CHECK` | `off` skips the breached-password check. |
| `BAD_MAIL_PROVIDERS`, `BAD_MAIL_PROVIDER_REGEX` | Extra disposable-email domains and patterns to refuse. |
| `MOJ_MEDIA_ROOT` | Imported statement uploads, served at `/media/...`. |

`NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL`, `NEXT_PUBLIC_APP_URL`, `AUTH_ISSUER`, `AUTH_JWKS_URL`,
`AUTH_RP_ID` and `DATABASE_URL` are set by the compose file from `MOJ_DOMAIN`. Do not set them yourself.

```bash
openssl rand -hex 32      # INSTANCE_SECRET
openssl rand -base64 32   # AUTH_SECRET
openssl rand -base64 24   # POSTGRES_PASSWORD
```

::: tip
Send yourself a password reset before announcing the site. Mail that does not arrive looks exactly like a site
that does not work.
:::

## Caddy

`infra/Caddyfile` is mounted read-only and serves the four names from `MOJ_DOMAIN`. `/api/problems/*` is routed
straight to the backend, so a problem repository needs only one address. Nothing else binds to a host port. If
you put a CDN in front, enable websockets on the `convex.` name or the site renders once and never updates.

## Start

```bash
docker compose -f infra/compose.prod.yml --project-directory . --env-file .env.prod \
  up -d postgres convex-backend

docker compose -f infra/compose.prod.yml --project-directory . \
  exec convex-backend ./generate_admin_key.sh

export CONVEX_SELF_HOSTED_URL=https://convex.judge.example.org
export CONVEX_SELF_HOSTED_ADMIN_KEY='moj-prod|01ab...'

npx convex deploy
npx convex env set AUTH_ISSUER https://judge.example.org
npx convex env set AUTH_JWKS_URL https://judge.example.org/api/auth/jwks
npx convex env set AUTH_URL https://judge.example.org

npm run db:migrate -w apps/web
npx convex run seed:run '{}'

docker compose -f infra/compose.prod.yml --project-directory . --env-file .env.prod up -d
```

::: warning
The admin key contains a `|`. Quote it, or the shell runs half of it as a pipeline.
:::

Then register at `/accounts/register/`, promote that account once, and work from
[the staff console](/admin/staff-console); a superuser rebrands the site at `/admin/config/branding/`. If you are
migrating an existing site, run [the import](/admin/import) in place of the seed and skip registering.

## Updating

```bash
git pull
docker compose -f infra/compose.prod.yml --project-directory . --env-file .env.prod pull
npx convex deploy
npm run db:migrate -w apps/web
docker compose -f infra/compose.prod.yml --project-directory . --env-file .env.prod up -d
```

`pull` fetches the release named by `MOJ_IMAGE_TAG`; put `build` in its place to build the checkout instead. The
checkout is still needed, because `npx convex deploy` and the migrations read it.

| Image | Tags |
| --- | --- |
| `ghcr.io/monashaps/moj-web` | `1.4.4`, `1.4`, `latest` |
| `ghcr.io/monashaps/moj-judge` | `1.4.4-tier1`, `1.4-tier1`, `latest-tier1` |

One web image serves any deployment: it reads `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL` and
`NEXT_PUBLIC_APP_URL` at run time, so changing the domain is a restart, not a rebuild.

::: warning
Deploy the functions before the new web image starts, and split a schema change that removes a field across two
releases.
:::

## Backups

```bash
BACKUP_DIR=/var/backups/moj
STAMP=$(date -u +%Y%m%dT%H%M%SZ)

CONVEX_SELF_HOSTED_URL=https://convex.judge.example.org \
CONVEX_SELF_HOSTED_ADMIN_KEY=$(cat /etc/moj/convex-admin-key) \
  npx convex export --path "$BACKUP_DIR/convex-$STAMP.zip"

docker compose -f /srv/moj/infra/compose.prod.yml --project-directory /srv/moj exec -T postgres \
  pg_dumpall -U moj | gzip > "$BACKUP_DIR/postgres-$STAMP.sql.gz"

tar czf "$BACKUP_DIR/media-$STAMP.tar.gz" -C /srv/moj/infra media
find "$BACKUP_DIR" -type f -mtime +30 -delete
```

Run it nightly from a systemd timer and copy the directory off the box. The export carries every problem's
published test data, so it grows with the problem set. To restore: `npx convex import --replace <export.zip>`,
pipe the gunzipped dump into `psql -U moj` in the `postgres` service, then
`npx convex run rankings:rebuildAggregates '{}'` to rebuild the leaderboard totals a bulk load bypasses.

## Judges

A judge polls the site and accepts no connections, so it needs no inbound port, no static address and no VPN.
Create it in the staff console under **Judges** and copy its key, which is shown once; put the problem data on
the box, or publish it from the problem repository and let the site hand it out.

```bash
docker run -d \
  --name moj-judge \
  --restart unless-stopped \
  --cap-add SYS_PTRACE \
  -e MOJ_URL=https://convex-site.judge.example.org \
  -e JUDGE_NAME=judge-2 \
  -e JUDGE_KEY=the-key-you-copied \
  -v /srv/problems:/problems \
  -v moj-judge-data:/judge-data-cache \
  ghcr.io/monashaps/moj-judge:latest-tier1
```

`MOJ_URL` is the `convex-site.` name, not the site's own, and is required; without `--cap-add SYS_PTRACE` every
submission fails with an internal error. The named volume keeps downloaded test data across a container
replacement, capped by `MOJ_DATA_MAX_GB`, 20 by default. The judge then appears on `/status/`.

| Tier | Runtimes | Size |
| --- | --- | --- |
| `tier1` | C through C23, C++03 through C++23, Java 8, Python 2 and 3, PyPy 3, Pascal, Perl, x64 assembly, AWK, sed, plain text | about 2.7 GB built |
| `tier2` | Tier 1 plus the mid-popularity runtimes | larger |
| `tier3` | Everything, including Clang, Node.js, Lean 4, ALGOL 68 and LLVM IR | about 18 GB to pull |

Tier 1 is published on every release and tier 2 is built from the Actions tab on demand; tier 3 is too large for
a hosted runner, so build it on the judge box with
`docker build --build-arg TIER=tier3 -t moj-judge:tier3 apps/judge`. The submit page offers a language only when
an online judge reports a runtime for it.

::: warning
Update judges one at a time, and never during a contest: a restart puts the judge through a fresh handshake.
:::
