# Troubleshooting

Each section starts with the symptom, then the checks in the order worth doing them.

## The judge does not connect

The judge is not on `/status/`, or it is listed as offline.

**Read its logs first.** Nearly every case is answered there.

```bash
docker logs --tail 100 moj-judge
```

**Is `MOJ_URL` the site origin?** This is the most common mistake. `MOJ_URL` has to be the Convex **site** origin,
the one serving HTTP actions, not the web app and not the cloud origin. From the judge box:

```bash
curl -i "$MOJ_URL/health"
```

A JSON body means you have the right host. HTML means you are pointed at the web app. A connection refused means
a firewall or the wrong port.

**Does the name match?** The `JUDGE_NAME` in the container has to be exactly the name of a judge in the staff
console. There is no automatic registration; an unknown name is rejected.

**Is the key right?** The site stores only a SHA-256 hash, so you cannot look the key up. Compare the hashes
before regenerating:

```bash
printf %s "$JUDGE_KEY" | sha256sum
```

If it does not match, issue a new key in the staff console and restart the container with it.

**Is the judge blocked or disabled?** Both are switches on the judge's row in the staff console, and a blocked
judge is refused at the handshake.

**Two judges, one name.** Two containers using the same name will each disconnect the other, so the judge appears
to flap online and offline every few seconds. Give the second one its own record.

**A firewall between the container and the host.** In development the judge reaches the Convex port through
`host.docker.internal`, which a host firewall that trusts only the loopback interface will block. Either allow the
Docker bridge through, or run the container with `--network host` and point `MOJ_URL` at `http://127.0.0.1:3211`.
See [quick start](/guide/quick-start#when-the-docker-bridge-cannot-reach-the-host).

**Clock skew.** A judge whose clock is minutes out fails TLS. `timedatectl` on the judge box.

## Submissions sit in the queue

The submission page says Queued and stays there.

**Is any judge online?** `/status/`. No judge means nothing will ever claim it.

**Does a judge have this problem?** The judge's row in the staff console lists the problem codes it reported at
handshake. A problem whose data has not reached any judge queues forever. Fix the sync, then:

```bash
docker restart moj-judge     # forces a fresh handshake and reindex
```

**Does a judge have this language?** The same row lists the runtimes. A tier 1 judge will not claim a Rust
submission. The submit page normally hides a language nothing can grade, so this usually means the only judge that
had it went offline after the page was loaded.

**Is the submission pinned?** A submission pinned to one judge only goes to that judge. If that judge is offline,
it waits.

**Tier.** Only judges in the lowest online tier claim work. A tier 1 judge that is online but hung means tier 2
judges will not pick up the slack. Disable the hung judge and the tier below takes over.

**Is it a rejudge behind live traffic?** Rejudge priorities are skipped while the tier is busy, on purpose. A
large rejudge during a busy period progresses slowly and speeds up when things go quiet. Watch it on the jobs
page.

**Stuck in Processing rather than Queued** is a different thing: a judge claimed it and died. The recovery cron
returns it to the queue after 60 seconds without a heartbeat, or 15 minutes without case progress, and after a
second failure marks it as an internal error rather than looping. A submission whose abort was requested is
aborted rather than requeued.

## Nobody appears to be signed in

The site renders, but every page behaves as though you were signed out, and requests feel slow before they do it.

This is the Convex backend failing to fetch the app's signing keys. Convex validates Better Auth's JWTs by
fetching the key set from `AUTH_JWKS_URL`, which by default points back at the web app. If that fetch cannot
succeed, every authenticated request waits for the timeout and then falls back to anonymous.

In development the usual cause is a host firewall that filters the Docker bridge, so the backend container cannot
reach the dev server on the host at all.

`npm run setup` detects this. It probes whether the backend container can reach the host and, when it cannot,
inlines the key set as a `data:` URI in `AUTH_JWKS_URL` instead of a URL, which Convex accepts. It leaves
`AUTH_URL` unset in the same case, so the problems API verifies keys against its own key table rather than waiting
on a fetch that cannot succeed. You will see these lines in the setup output:

```
the convex container cannot reach the host, so the JWKS is inlined as a data URI
the convex container cannot reach the host, so AUTH_URL is left unset
```

The cost is that rotating the signing keys needs another `npm run setup`, and that a problems API key has to exist
in the key table rather than only in Better Auth. To go back to fetching a URL, open the firewall for the Docker
bridge subnet and re-run setup.

To check what the deployment is actually using:

```bash
npx convex env get AUTH_JWKS_URL
npx convex env list
```

In production the same symptom means the backend cannot reach `https://<your domain>/api/auth/jwks`, which is
usually DNS inside the compose network or a proxy that is not up yet.

## Convex admin key problems

**`npx convex deploy` says it cannot authenticate.** The self-hosted backend needs both variables:

```bash
export CONVEX_SELF_HOSTED_URL=https://convex.judge.example.org
export CONVEX_SELF_HOSTED_ADMIN_KEY='moj-prod|01ab...'
npx convex deploy
```

The key contains a `|`. Quote it, or the shell will try to run half of it as a pipeline.

**Generating a new one:**

```bash
docker compose -f infra/compose.prod.yml --project-directory . \
  exec convex-backend ./generate_admin_key.sh
```

Generating a key does not invalidate the old ones.

**`npm run dev` cannot reach the backend**, or `No CONVEX_DEPLOYMENT set`. `.env.local` is missing, or holds a key
for a deployment that no longer exists because the stack was recreated with a new `INSTANCE_SECRET`. Rerun
`npm run setup`.

**The instance secret changed.** Changing `INSTANCE_SECRET` on an existing deployment makes the stored data
unreadable. If that happened by accident, put the old value back. If it is genuinely gone, restore from a Convex
export.

**`Hex-decoded key was 31 bytes, not 32`** in the backend log means `INSTANCE_SECRET` is not 64 hex characters.

## Postgres

**The backend logs that it connected to a database and then exits.** The database does not exist. Both databases
are created by `infra/scripts/postgres-init/01-databases.sh`, which only runs the first time the Postgres volume
is initialised. On a volume that already existed, create the missing one by hand:

```bash
docker compose -f infra/compose.prod.yml --project-directory . exec postgres \
  psql -U moj -c 'CREATE DATABASE moj_auth OWNER moj'
npm run db:migrate -w apps/web
```

Convex's own database is named after `INSTANCE_NAME` with dashes replaced by underscores, and the backend will not
accept another name. `moj-dev` means `moj_dev`; `moj-prod` means `moj_prod`.

**Missing table errors from Better Auth** mean the Drizzle migrations have not run against the auth database:

```bash
npm run db:migrate -w apps/web
```

**Port 5433 is already in use** in development. That is the host port the dev compose file publishes so it does
not collide with a local Postgres on 5432:

```bash
ss -ltnp | grep 5433
```

**Resetting the auth database** without touching anything else:

```bash
docker compose -f infra/compose.dev.yml --project-directory . exec postgres \
  psql -U moj -d postgres -c 'DROP DATABASE moj_auth' -c 'CREATE DATABASE moj_auth'
npm run db:migrate -w apps/web
```

**Disk.** Convex stores its data in Postgres, so a full disk stops writes, which looks like the site being
read-only with errors in the logs. `df -h` first, always.

## Resetting a development stack

Wipe everything, including both databases and all Convex data:

```bash
docker compose -f infra/compose.dev.yml --project-directory . down -v
rm -f .env.local apps/web/.env.local
npm run setup
```

Keep the data and only re-push the functions and the seed:

```bash
npx convex dev --once
npx convex run seed:run '{}'
```

Re-seed over the top of existing rows, which overwrites the languages and the navigation items and leaves
everything else alone:

```bash
npx convex run seed:run '{"force": true}'
```

## Fonts and PDFs

**The site renders in a fallback font.** The fonts are self-hosted under `apps/web/public/fonts`, deliberately, so
that no request goes to Google at page load. If they are missing, the build did not copy them or the container was
built from an incomplete tree:

```bash
docker compose -f infra/compose.prod.yml --project-directory . exec web ls public/fonts
```

**PDF statements fail or come out wrong.** PDF rendering is the Typst binary, with the `cmarker` and `mitex`
packages vendored under `packages/content/typst/packages` so a compile needs no network. Check the binary:

```bash
docker compose -f infra/compose.prod.yml --project-directory . exec web typst --version
```

If it is not on `PATH`, set `TYPST_BIN` to its location. A failed render is recorded rather than shown to the
user, so look on the jobs page for the error.

**Maths does not render.** KaTeX's stylesheet has to load for maths to be laid out. If formulas appear as plain
text with visible braces, the CSS is missing rather than the maths being wrong.

## Dark mode

**The theme flickers on load.** The theme is applied from an attribute on the root element before the first paint.
A flash means it is being set by client-side script afterwards, which is a bug worth reporting with the page you
saw it on.

**The toggle does not stick.** For a signed-in user the choice is saved to their profile, so it follows them
between devices. Signed out, it is per-browser, and a browser that blocks storage forgets it on every load. The
operator's default theme, set on the branding page, is what a visitor with nothing stored gets.

**A page is unreadable in dark mode.** Almost always a literal colour somewhere instead of a token. Colours come
from `packages/ui/src/tokens.css`, defined for light on `:root` and overridden for dark; anything hard-coded looks
right in one theme and wrong in the other. Report it with the page and the element.

## Lint will not run on NixOS

Biome ships a prebuilt binary that is dynamically linked against a generic Linux loader, so it will not start on
NixOS. Run it through `steam-run`:

```bash
steam-run node_modules/.bin/biome check .
```

`npm run lint` and `npm run format` are the same binary, so the same wrapper applies to both.

## Everything is slow

Check in this order:

1. `/status/` for judge load. A judge at load 1.0 is saturated, and submissions will queue.
2. The jobs section for a running batch rejudge. They are chunked, but a large one is real work.
3. `docker stats` on the web box, for a container that is out of memory.
4. `df -h`, for a full disk.
5. The Convex dashboard's logs for functions that are erroring, which usually shows up as a page that renders
   empty rather than as an error.

## Getting help

Open a ticket on the site, or an issue on the repository. Include the URL, what you did, what happened, and the
relevant log lines. For a judge problem, the output of `docker logs --tail 100 moj-judge` answers most questions
before anyone has to ask.
