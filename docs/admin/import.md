# Importing from DMOJ

MOJ imports a DMOJ site from a MariaDB dump. Users keep their passwords, their two-factor secrets, their passkeys
and their API tokens; problems keep their codes; submissions keep their ids. The point of the exercise is that
nobody has to be told to reset anything.

The importer reads a dump file, so it needs no running MySQL or MariaDB server, and it never touches the old site.
It streams the dump, so a multi-gigabyte file never has to fit in memory.

## Take a dump

On the machine running the DMOJ site:

```bash
mysqldump --single-transaction --quick --hex-blob --default-character-set=utf8mb4 \
  --routines=false --triggers=false --events=false \
  --databases dmoj | gzip > dump-$(date +%F).sql.gz
```

`--hex-blob` is not optional. The TOTP secrets and scratch codes are binary columns holding Fernet tokens, and hex
is the only form the parser can read back byte for byte. `--single-transaction` keeps the dump consistent without
locking the site, and `--quick` stops mysqldump buffering the submissions table into memory.

Copy it to the machine you are importing on. `tools/import/dump*.sql.gz`, `tools/import/secrets*` and
`tools/import/out/` are all gitignored, but the dump is production data: never commit it, any row from it, or
anything derived from it.

```bash
scp you@old-site:dump-2026-09-10.sql.gz tools/import/
```

## Get the secret key

DMOJ encrypts TOTP secrets and scratch codes with Fernet, keyed on Django's `SECRET_KEY`. Without the key the
accounts still import, and every user who had two-factor is listed in the report as needing to enrol again.

Read the key from the old site's settings and put it in a file the importer reads:

```bash
cat > tools/import/secrets.env <<'ENV'
SECRET_KEY=the-secret-key-from-the-old-site
ENV
chmod 600 tools/import/secrets.env
```

`DJANGO_SECRET_KEY=` is accepted as well. Treat the value as a credential: it is what protects every stored TOTP
secret on the old site.

The key is derived the way django-fernet-fields derives it, HKDF-SHA256 of the secret key to 32 bytes then
urlsafe base64. That is done for you; you only have to supply the key.

## Copy the media and the problem data

Two directories on the old boxes are not in the dump:

```bash
# statement images, from the web box
rsync -avz you@old-site:/path/to/dmoj/media/ infra/media/

# test data, from the judge box
rsync -avz you@old-judge:~/problems/ infra/problems/
```

Both paths are gitignored. The app serves the media tree at `/media/...`, which is where imported statements point
their images.

## What the importer needs

The stack has to be up and the Drizzle migrations applied. The importer reads these from the environment, or from
`.env.local` and `.env` in any parent directory:

- `CONVEX_SELF_HOSTED_URL` and `CONVEX_SELF_HOSTED_ADMIN_KEY`, unless you pass `--dry-run`;
- `DATABASE_URL`, for the Better Auth tables. It writes rows; it never creates tables;
- `AUTH_SECRET`, the value the web app runs with. The importer re-encrypts each TOTP secret and scratch code set
  with it the way Better Auth does, so a mismatch means every two-factor sign-in fails after the import.

## Run it

Always do a dry run first and read the report.

```bash
npm run import -w tools/import -- \
  --dump tools/import/dump-2026-09-10.sql.gz \
  --secret-key-file tools/import/secrets.env \
  --dry-run --report
```

Then the same command without `--dry-run`:

```bash
npm run import -w tools/import -- \
  --dump tools/import/dump-2026-09-10.sql.gz \
  --secret-key-file tools/import/secrets.env \
  --report
```

| Option | Meaning |
| --- | --- |
| `--dump <file>` | The dump, `.sql` or `.sql.gz`. Required. |
| `--secret-key-file <file>` | The file holding `SECRET_KEY=...`. |
| `--tables a,b` | Only fill these Convex tables. |
| `--dry-run` | Transform and write JSONL only. Touches neither Convex nor Postgres. |
| `--out <dir>` | Output directory, default `tools/import/out`. |
| `--report` | Print the long report, including unmapped columns. |
| `--resume` | Skip tables already finished in `<out>/state.json`. |
| `--clear` | Clear each Convex table before inserting into it. |
| `--force-extract` | Re-parse the dump even if the extracted JSONL looks current. |
| `--fresh` | Forget `<out>/state.json` and treat every table as unloaded. |
| `--skip-auth` | Do not write the Better Auth tables. |
| `--skip-convex` | Write only the Better Auth tables. |

What it does, in order:

1. **Extract.** The dump is streamed once and split into `out/raw/<table>.jsonl`, one JSON object per row, with a
   manifest of the column names and types taken from the `CREATE TABLE` statements. Binary columns are kept as
   hex. Re-running reuses this unless the dump changed or `--force-extract` is given.
2. **Transform and load.** Tables are processed in dependency order. Each writes `out/docs/<table>.jsonl` and
   pushes batches of 200 documents into Convex, and the ids that come back fill a legacy-id map that the next
   table resolves its foreign keys against. The reference tables the seed also writes are matched on their
   natural key rather than inserted blindly; see [importing into a seeded deployment](#importing-into-a-seeded-deployment).
3. **Better Auth.** The user, account, two-factor and passkey rows are upserted into Postgres. Skipped by
   `--dry-run`, which still builds and counts them so the report is complete.
4. **Report.** `out/report.json` and a summary on stdout.

A self-hosted Convex deployment caps write throughput. The loader catches that, backs off and retries the batch,
printing a line each time, so a large table simply takes a little longer. A rejected batch wrote nothing, so
nothing is ever written twice by a retry.

## Afterwards

Rebuild the leaderboard aggregates. Convex has no triggers, so the aggregates are maintained by the mutations that
move a profile's points, and an import writes rows straight into the table. An interrupted or resumed run can
leave the tree short.

```bash
npx convex run rankings:rebuildAggregates '{}'
```

It works in pages and returns a cursor; call it again with the cursor until it reports it is done. Rebuilding is
cheap and safe to repeat. Staff can do the same thing in one go from the console.

Then, if you want API tokens minted by the old site to keep working, give the deployment the old `SECRET_KEY`:

```bash
npx convex env set LEGACY_SECRET_KEY "$SECRET_KEY"
```

Without it, legacy tokens are rejected and tokens minted here still work.

## What carries over

| Data | Notes |
| --- | --- |
| Users | Username, email, join date, timezone, language, display rank, about, notes. |
| Passwords | The Django `pbkdf2_sha256` hash verbatim. The first successful sign-in rewrites it in Better Auth's format. |
| Two-factor | The decrypted TOTP secret and the scratch codes, re-encrypted the way Better Auth stores them, so existing authenticator entries keep working. Needs the secret key. |
| Passkeys | The stored credentials. They keep working only if the site keeps the same domain. |
| API tokens | As a legacy hash, so existing scripts keep authenticating while `LEGACY_SECRET_KEY` is set. |
| Profiles | Points, performance points, problem count, rating, mute and unlisted flags, permissions, memberships. |
| Organisations and classes | Members, administrators, access codes, join requests with their state. |
| Problems | Codes, statements, authors, curators, testers, types, groups, limits, per-language limits, licences, translations, clarifications, editorials. |
| Problem data | The stored test case configuration, checkers and points, so the test data page matches. |
| Submissions | Ids, dates, status and result, time and memory, points, language, and which judge graded them. |
| Submission sources | The source code of every submission. |
| Submission cases | Per-case status, time, memory, points and feedback, so old submission pages render in full. |
| Contests | Times, format and configuration, problems and labels, access control, rating settings, tags. |
| Participations | Live, spectating and virtual, with scores, cumulative time and per-problem cells. |
| Ratings | Every rating change, so rating history and graphs are intact. |
| Comments | Bodies, scores, votes, hidden state and threading. |
| Blog | Posts with their publish dates, authors and visibility. |
| Tickets | Titles, messages, assignees and open state. |
| Navigation, misc config, flat pages | The site chrome, so the nav bar and the about page look the same afterwards. |

## What does not

- **Sessions.** Everyone is signed out after the import and signs in again with the same password. There is no way
  to carry a Django session into Better Auth, and it would be a bad idea if there were.
- **Registration keys.** A user who never activated is imported unverified and gets an ordinary verification mail
  instead of the old activation link.
- **Social logins.** There is no social provider here.
- **Django bookkeeping.** The admin log, the migrations table, the session table and the redirect table are all
  dropped. [Revisions](/admin/staff-console#revisions) start from the import.
- **Custom user JavaScript.** DMOJ let a user attach a script to their own pages. There is no equivalent, and
  adding one would mean running arbitrary user JavaScript.
- **Anything computed.** Aggregates, caches, the sitemap and rendered PDFs are rebuilt rather than copied.

Things the report will tell you about, and which are worth knowing before you read it:

- **Problems with no date.** DMOJ allows a problem to have no date and the new schema does not, so those become
  zero and sort last under "recently added" until someone sets one. Every such problem is listed.
- **Contest label scripts.** DMOJ's per-contest Lua label script has no equivalent. A contest that has one is
  imported with the custom label scheme and an empty label list, and is listed. Contests without one take their
  labels from their format, as DMOJ does.
- **Duplicate or empty email addresses.** Better Auth requires a unique email, so a duplicate or blank address
  becomes `<username>.<id>@imported.invalid` and is listed. Those users sign in by username and can set a real
  address afterwards.
- **Judges** are imported offline, on tier 0. They come back online when the judge container handshakes.
- **Freeze settings** are zero on every imported contest, because DMOJ has no such field.
- **Unresolved references** are rows pointing at something that was already deleted from the old site. They are
  dropped and listed.

Accounts whose password hash starts with `!` were unusable on the old site as well, which is Django's marker for
an account with no password. They import, but those users need a reset.

## Importing into a seeded deployment

Importing on top of `npm run setup` is supported, and is the normal case: setup gives you a usable site, and the
import fills it from the dump.

The seed and the dump both write the small reference tables, and each of those tables has a natural key:

| Table | Key |
| --- | --- |
| `languages` | `key` |
| `problemTypes` | `name` |
| `problemGroups` | `name` |
| `licenses` | `key` |
| `navigationBar` | `key` |
| `miscConfig` | `key` |
| `flatPages` | `url` |

A row from the dump whose key is already in the table **patches that row** instead of inserting a second one, and
the imported legacy id maps to it, so every table imported afterwards points at the same row. Reference rows are
matched by their natural key; everything else is inserted as before. Running the seed again after an import is
likewise a no-op, because the seed upserts by the same keys.

An older importer inserted these blindly. A site that was seeded and then imported by it ends up with two rows for
every key, and because a language lookup by key was no longer unique the judge handshake failed with an HTTP 400.
Lookups take the first match now, so nothing user-facing breaks, but the duplicates are still there. Repair them
once, as a superuser:

```bash
npx convex run admin/languages:dedupeByKey '{}'
```

It keeps the imported row of each duplicated key, because that is the one the imported submissions point at,
repoints `problems.allowedLanguageIds`, `languageLimits`, `submissions`, `profiles` and `runtimeVersions` at it,
deletes the rest, and reports the keys it repaired, the rows it deleted and the references it rewrote. It is
bounded, so on a large site it schedules itself until it is finished; `isDone: false` means a follow-up pass is
running. Running it again once it is done does nothing.

## Re-running it

Apart from the reference tables above, the importer only inserts. It never deletes, so importing a table that is
already loaded **duplicates it**.

The safe ways to repeat work:

- `--resume` skips the tables recorded as finished in `out/state.json` and pulls their id maps back from Convex, so
  a run that stopped part way carries on. A dry run resumes from the JSONL it wrote instead, and mixing a dry-run
  state file with a real load is refused.
- `--fresh` forgets the state file and treats every table as unloaded, which is what you want after clearing the
  deployment.
- `--clear --tables <one>` reloads a single table. Be careful: clearing a table that other rows point at, profiles
  above all, leaves those references dangling, because the ids change when the rows come back. If the thing you
  need to reload is widely referenced, clear and import everything in one run instead.

So the practical procedure for a migration is:

1. import from a dump into a clean deployment and check the result. Repeat as often as you like while the new site
   has no real traffic, wiping between runs.
2. when the result looks right, take a fresh dump, put the old site into read-only mode or take it down, wipe the
   new deployment, run the import one last time, and cut the DNS over.

After the cut-over, do not run the import again. If you need part of the old data later, load the dump into a
scratch database and query it there.

## Checking the result

Read the report's per-table counts against the old site, then check by hand:

- sign in as an imported administrator with their old password;
- open a user with two-factor enabled and confirm their authenticator code is accepted;
- open an old submission and confirm the per-case table renders;
- open a contest's ranking page and compare it against the old site;
- open a problem with images in its statement and confirm they load.

The first of those is the one that matters most, because a password that does not verify means the hash import is
wrong, and everything else is easier to fix afterwards.
