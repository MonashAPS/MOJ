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
curl -i "$MOJ_URL/judge/abort?submissionId=1"
```

A JSON body, even an error one, means you have the right host. HTML means you are pointed at the web app. A
connection refused means a firewall or the wrong port.

**Does the name match?** The `JUDGE_NAME` in the container has to be exactly the name of a judge in the staff
console. There is no automatic registration; an unknown name is rejected.

**Is the key right?** The site stores only a SHA-256 hash, so you cannot look the key up. Regenerate it in the
staff console and restart the container with the new value. Compare the hashes if you want to check before
regenerating:

```bash
printf %s "$JUDGE_KEY" | sha256sum
```

**Is the judge blocked or disabled?** Both are switches on the judge's page in the staff console, and a blocked
judge is refused at the handshake.

**Two judges, one name.** Two containers using the same name will each disconnect the other, so the judge appears
to flap online and offline every few seconds. Give the second one its own record.

**Clock skew.** A judge whose clock is minutes out fails TLS. `timedatectl` on the judge box.

## Submissions sit in the queue

The submission page says Queued and stays there.

**Is any judge online?** `/status/`. No judge means nothing will ever claim it.

**Does a judge have this problem?** The judge's page lists the problem codes it reported at handshake. A problem
whose data has not been rsynced to any judge queues forever. Fix the sync, then:

```bash
docker restart moj-judge     # forces a fresh handshake and reindex
```

**Does a judge have this language?** The same page lists the runtimes. A tier 1 judge will not claim a Rust
submission. The submit page normally hides a language nothing can grade, so this usually means the only judge that
had it went offline after the page was loaded.

**Is the submission pinned?** A submission with `judgePin` set only goes to that judge. If that judge is offline,
it waits. This is visible on the submission's admin page.

**Tier.** Only judges in the lowest online tier claim work. A tier 1 judge that is online but hung means tier 2
judges will not pick up the slack. Disable the hung judge and the tier below takes over.

**Is it a rejudge behind live traffic?** Priorities 2 and 3 are skipped while the tier is busy, on purpose. A large
rejudge during a busy period progresses slowly and speeds up when things go quiet. Watch it on the jobs page.

**Stuck in Processing rather than Queued** is a different thing: a judge claimed it and died. The recovery cron
returns it to the queue after 60 seconds without a heartbeat, or 15 minutes without case progress, and after a
second failure marks it as an internal error rather than looping.

## Convex admin key problems

**`npx convex deploy` says it cannot authenticate.** The self-hosted backend needs both variables:

```bash
export CONVEX_SELF_HOSTED_URL=https://convex.example.org
export CONVEX_SELF_HOSTED_ADMIN_KEY='moj|01ab...'
npx convex deploy
```

The key contains a `|`. Quote it, or the shell will try to run half of it as a pipeline.

**Generating a new one:**

```bash
docker compose -f infra/compose.prod.yml exec convex-backend ./generate_admin_key.sh
```

Generating a key does not invalidate the old ones.

**`npm run dev` cannot reach the backend.** `.env.local` is written by `npm run setup` and holds the development
key. If the compose stack was recreated with a new `INSTANCE_SECRET`, that key is for a deployment that no longer
exists. Rerun `npm run setup`, or delete `.env.local` and rerun it.

**The instance secret changed.** Changing `INSTANCE_SECRET` on an existing deployment makes the stored data
unreadable. If that has happened by accident, put the old value back. If it is genuinely gone, restore from a
Convex export.

## Postgres

**The web container will not start and the logs mention the database.** Check Postgres is healthy and both
databases exist:

```bash
docker compose -f infra/compose.prod.yml ps
docker compose -f infra/compose.prod.yml exec postgres psql -U moj -c '\l'
```

`convex` and `moj_auth` both have to be there. `moj_auth` is created by `initdb/01-auth-db.sql`, which only runs
the first time the volume is initialised. On a volume that already existed, create it by hand:

```bash
docker compose -f infra/compose.prod.yml exec postgres \
  psql -U moj -c 'CREATE DATABASE moj_auth OWNER moj'
npm run db:migrate
```

**Missing table errors from Better Auth** mean the Drizzle migrations have not run against `moj_auth`:

```bash
npm run db:migrate
```

**Port 5433 is already in use** in development. That is the host port the dev compose file publishes so it does not
collide with a local Postgres on 5432. Something else has taken it:

```bash
ss -ltnp | grep 5433
```

**Disk.** Convex stores its data in Postgres, so a full disk stops writes, which looks like the site being read-only
with errors in the logs. `df -h` first, always.

## Fonts

**The site renders in a fallback font.** The fonts are self-hosted under `apps/web/public/fonts`, deliberately, so
that no request goes to Google at page load. If they are missing, the build did not copy them or the container was
built from an incomplete tree. Check inside the running container:

```bash
docker compose -f infra/compose.prod.yml exec web ls public/fonts
```

Bai Jamjuree is used for headings and the wordmark, IBM Plex Sans for body text, IBM Plex Mono for code.

**PDF statements come out with the wrong font, or fail.** PDF rendering is Typst, and it needs its own fonts and
the vendored packages under `packages/content/typst/packages`. Check the binary is there:

```bash
docker compose -f infra/compose.prod.yml exec web typst --version
```

If it is not on `PATH`, set `TYPST_BIN` to its location. A PDF that fails to render is recorded on the job rather
than shown to the user, so check the jobs section of the staff console for the error.

**Maths does not render.** KaTeX's stylesheet has to load for maths to be laid out. If formulas appear as plain
text with visible braces, the CSS is missing rather than the maths being wrong.

## Dark mode

**The theme flickers on load.** The theme is applied from `profiles.siteTheme` on the server and from a
`data-theme` attribute on the root element. A flash means the attribute is being set by client-side script after
the first paint, which is a bug worth reporting with the page you saw it on.

**The toggle does not stick.** For a signed-in user the choice is saved to their profile, so it follows them
between devices. Signed out, it is per-browser. A browser that blocks storage will forget it on every load.

**A page is unreadable in dark mode.** Almost always a literal colour somewhere instead of a token. Colours come
from `packages/ui/src/tokens.css`, defined for light on `:root` and overridden for dark; anything hard-coded looks
right in one theme and wrong in the other. Report it with the page and the element.

**`auto` follows the system.** `profiles.siteTheme` is `auto`, `light` or `dark`, and `auto` means
`prefers-color-scheme`. A user who says the site "changes on its own in the evening" has a phone that switches
theme on a schedule.

## Everything is slow

Check in this order:

1. `/status/` for judge load. A judge at load 1.0 is saturated, and submissions will queue.
2. The jobs section for a running batch rejudge. They are chunked, but a large one is real work.
3. `docker stats` on the web box, for a container that is out of memory.
4. `df -h`, for a full disk.
5. The Convex dashboard's logs for functions that are erroring, which usually shows up as a page that renders
   empty rather than as an error.

## Getting help

Open a ticket on the site, or an issue on
[the repository](https://github.com/MonashAPS/MOJ/issues). Include the URL, what you did, what happened, and the
relevant log lines. For a judge problem, the output of `docker logs --tail 100 moj-judge` answers most questions
before anyone has to ask.
