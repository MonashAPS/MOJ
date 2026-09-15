# Importing from DMOJ

The importer reads a `mysqldump` of a DMOJ database and fills a running MOJ. It never touches the old site,
needs no running MySQL server, and streams the dump.
[Compatibility with DMOJ](/guide/compatibility#what-imports) lists what comes across.

## Take a dump

```bash
mysqldump --single-transaction --quick --hex-blob --default-character-set=utf8mb4 \
  --routines=false --triggers=false --events=false \
  --databases dmoj | gzip > dump-$(date +%F).sql.gz
```

::: warning
`--hex-blob` is not optional. The two-factor secrets are binary columns, and hex is the only form the parser can
read back byte for byte.
:::

Copy it to `tools/import/`, which is gitignored. It is production data: never commit it or anything derived from
it.

DMOJ encrypts two-factor secrets with Django's `SECRET_KEY`. Without it the accounts still import and every user
who had two-factor is listed in the report as needing to enrol again.

```bash
cat > tools/import/secrets.env <<'ENV'
SECRET_KEY=the-secret-key-from-the-old-site
ENV
chmod 600 tools/import/secrets.env
```

`DJANGO_SECRET_KEY=` is accepted as well. Treat the value as a credential.

Two directories are not in the dump:

```bash
rsync -avz you@old-site:/path/to/dmoj/media/ infra/media/     # statement images
rsync -avz you@old-judge:~/problems/ infra/problems/          # test data
```

## Run it

The stack has to be up and the migrations applied. The importer reads `CONVEX_SELF_HOSTED_URL`,
`CONVEX_SELF_HOSTED_ADMIN_KEY`, `DATABASE_URL` and `AUTH_SECRET` (or `BETTER_AUTH_SECRET`) from the environment
or from `.env.local`. `AUTH_SECRET` must be the value the web app runs with, or every two-factor sign-in fails
afterwards.

```bash
npm run import -w tools/import -- \
  --dump tools/import/dump-2026-09-10.sql.gz \
  --secret-key-file tools/import/secrets.env \
  --dry-run --report
```

Read the report, then run the same command without `--dry-run`.

| Option | Meaning |
| --- | --- |
| `--dump <file>` | The dump, `.sql` or `.sql.gz`. Required. |
| `--secret-key-file <file>` | The file holding `SECRET_KEY=...`. |
| `--tables a,b` | Only fill these tables. |
| `--dry-run` | Transform and write JSONL only; touch neither database. |
| `--out <dir>` | Output directory, default `tools/import/out`. |
| `--report` | Print the long report, including unmapped columns. |
| `--resume` | Skip tables recorded as finished in `<out>/state.json`. |
| `--clear` | Clear each table before inserting into it. |
| `--force-extract` | Re-parse the dump even if the extracted JSONL looks current. |
| `--fresh` | Forget the state file and treat every table as unloaded. |
| `--skip-auth`, `--skip-convex` | Write only one side. |

It extracts to `<out>/raw/`, transforms and loads in dependency order through `<out>/docs/`, then writes
`<out>/report.json`. A throttled write is retried after a backoff, and a rejected batch wrote nothing.

## Afterwards

```bash
npx convex run rankings:rebuildAggregates '{}'
npx convex env set LEGACY_SECRET_KEY "$SECRET_KEY"
```

The first rebuilds the leaderboard totals, which a bulk load bypasses; it works in pages and returns a cursor, so
call it again with the cursor until it is done. The second keeps API tokens minted by the old site verifying.

The report names what needs a human: problems with no date, contests that had a Lua label script, duplicate or
empty email addresses rewritten to `<username>.<id>@imported.invalid`, and rows pointing at something already
deleted. Judges import offline on tier 0, and freeze settings are zero on every contest.

Then check by hand: sign in as an imported administrator with their old password, confirm an authenticator code
is accepted, open an old submission and a contest ranking, and open a problem whose statement has images.

## Over a seeded deployment

Supported, and the normal case. `languages` (by `key`), `problemTypes` and `problemGroups` (by `name`),
`licenses`, `navigationBar` and `miscConfig` (by `key`) and `flatPages` (by `url`) are matched on that natural
key, so a dump row patches the seeded row instead of inserting a second one.

An older importer inserted them blindly, which left two rows per key: the judge handshake then failed with an
HTTP 400 and the header rendered every navigation item twice. Repair a site in that state once, in either order:

```bash
npx convex run admin/languages:dedupeByKeyStep '{}'
npx convex run admin/dedupe:dedupeNaturalKeysStep '{}'
```

Each repoints every reference before deleting anything and schedules itself until finished; `isDone: false`
means another pass is running.

## Re-running it

Apart from those reference tables the importer only inserts, so importing a table that is already loaded
**duplicates it**. `--resume` continues a run that stopped part way, `--fresh` treats everything as unloaded
after clearing the deployment, and `--clear --tables <one>` reloads a single table, which is only safe for a
table nothing else points at.

So: import into a clean deployment as often as you like while the new site has no traffic, wiping between runs.
When it looks right, take a fresh dump, stop the old site, wipe, import once more, and cut the DNS over. Do not
import again afterwards.
