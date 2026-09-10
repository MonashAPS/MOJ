# Importing from DMOJ

MOJ imports a DMOJ site from a MariaDB dump. Users keep their passwords, their two-factor secrets, their passkeys
and their API tokens; problems keep their codes; submissions keep their ids. The point of the exercise is that
nobody has to be told to reset anything.

The import reads a dump file, so it does not need a running MySQL or MariaDB server, and it never touches the old
site.

## Take a dump

On the machine running the DMOJ site:

```bash
mysqldump \
  --single-transaction \
  --quick \
  --default-character-set=utf8mb4 \
  --databases dmoj \
  | gzip > dump-$(date +%F).sql.gz
```

`--single-transaction` keeps the dump consistent without locking the site, and `--quick` stops mysqldump buffering
the submissions table into memory, which on a site with a few hundred thousand submissions matters.

Copy it to the machine you are importing on:

```bash
scp you@old-site:dump-2026-09-10.sql.gz tools/import/
```

## Get the secret key

DMOJ encrypts TOTP secrets in the database with django-fernet-fields, keyed on Django's `SECRET_KEY`. Without the
key, the import can still bring the accounts across but two-factor has to be re-enrolled by every user who had it.

Read the key from the old site's `local_settings.py`, or from its environment, and put it in a file the import
tool reads:

```bash
cat > tools/import/secrets.env <<'ENV'
DJANGO_SECRET_KEY=the-secret-key-from-local_settings.py
ENV
chmod 600 tools/import/secrets.env
```

`tools/import/secrets.env` is gitignored. Treat the key as a credential: it is what protects every stored TOTP
secret on the old site.

The key is derived the way django-fernet-fields derives it, HKDF-SHA256 of the secret key to 32 bytes, then
urlsafe base64. That is done for you; you only have to supply the key.

## Copy the media and the problem data

Two directories on the old boxes are not in the dump:

```bash
# statement images, from the web box
rsync -avz you@old-site:/path/to/dmoj/media/ infra/media/

# test data, from the judge box
rsync -avz you@old-judge:~/problems/ infra/problems/
```

Both paths are gitignored. The club's `infra/scripts/pull-production.sh` does all three copies, the dump included,
in one go. It is not run in CI, because it needs credentials for the production boxes.

## Run the import

```bash
npm run import -- \
  --dump tools/import/dump-2026-09-10.sql.gz \
  --secret-key-file tools/import/secrets.env
```

What it does, in order:

1. streams the dump, parsing the `INSERT` statements table by table into JSONL under `tools/import/out/`, without
   loading any table into memory whole;
2. transforms each table into Convex documents, resolving the old integer foreign keys in dependency order and
   keeping the old primary key as `legacyId` on every document;
3. writes the Better Auth rows into Postgres: the user, an account carrying the Django password hash verbatim, the
   two-factor row with the decrypted TOTP secret and its backup codes, any passkeys, and the legacy API token hash
   on the profile;
4. loads each Convex table with `convex import --replace`;
5. prints a report of the row counts per table and anything it skipped, with the reason.

The dependency order is languages, problem types, groups and licenses, then users and profiles, organisations and
classes, then problems with their translations, clarifications, language limits, solutions, data and cases, then
contests with their problems and participations, then submissions with their sources and cases, then ratings,
comments, votes, blog posts, tickets, the navigation bar, the misc config and the flat pages.

A large site takes a while. The submissions table is almost all of it.

## What carries over

| Data | Notes |
| --- | --- |
| Users | Username, email, join date, timezone, language, display rank, about, notes. |
| Passwords | The Django `pbkdf2_sha256` hash verbatim. The first successful login rewrites it in Better Auth's format. |
| TOTP | The decrypted secret and the backup codes, so existing authenticator entries keep working. Needs the secret key. |
| Passkeys | The stored credentials. They keep working only if the site keeps the same domain. |
| API tokens | Carried across as a legacy hash. Existing scripts keep authenticating. |
| Profiles | Points, performance points, problem count, rating, mute and unlisted flags, permissions, group memberships. |
| Organisations and classes | Members, administrators, access codes, join requests with their state. |
| Problems | Codes, statements, authors, curators, testers, types, groups, limits, per-language limits, licenses, translations, clarifications, editorial. |
| Problem data | The stored test case configuration, checkers and points, so `/problem/<code>/test_data` matches. |
| Submissions | Ids, dates, status and result, time and memory, points, language, and which judge graded them. |
| Submission sources | The source code of every submission. |
| Submission cases | Per-case status, time, memory, points and feedback, so old submission pages render in full. |
| Contests | Times, format and configuration, problems and labels, access control, ratings settings, tags. |
| Participations | Live, spectating and virtual, with scores, cumulative time and format data. |
| Ratings | Every rating change, so rating history and rating graphs are intact. |
| Comments | Bodies, scores, votes, hidden state and threading. |
| Blog | Posts with their publish dates, authors and visibility. |
| Tickets | Titles, messages, assignees and open state. |
| Navigation, misc config, flat pages | The site chrome, so the nav bar and the about page look the same afterwards. |

## What does not

- **Sessions.** Everyone is signed out after the import and signs in again with the same password. There is no way
  to carry a Django session into Better Auth, and it would be a bad idea if there were.
- **Django admin log entries.** MOJ's [revisions](/admin/staff-console#revisions) start from the import.
- **Anything computed.** Aggregates, caches, the sitemap and rendered PDFs are rebuilt rather than copied.
- **Uploaded files not referenced by the media directory.** If a statement points at a file that is not in
  `media/`, it is a broken link before and after.

Accounts whose password hash starts with `!` were unusable on the old site, which is Django's marker for an
account with no password. They import, but those users need a password reset before they can sign in.

## Re-running it

The import is idempotent at the table level: it loads with `convex import --replace`, so running it again replaces
the imported tables rather than duplicating rows. `legacyId` and its index are what let a second run line up with
the first.

That means a re-run **discards anything created since the previous run**. Submissions made on the new site after
the import, problems added there, comments posted there: all gone, because the table is replaced by the dump's
contents.

So the practical procedure for a migration is:

1. import from a dump, and check the result. Repeat as often as you like while the new site has no real traffic.
2. when the result looks right, take a fresh dump, put the old site into read-only mode or take it down, run the
   import one last time, and cut the DNS over.

After the cut-over, do not run the import again. If you need part of the old data later, load the dump into a
scratch database and query it there.

## Checking the result

```bash
# Row counts, from the report the import prints, against the old site.
mysql -e 'select count(*) from judge_submission' dmoj

# And in Convex, from the dashboard or the CLI.
npx convex run --no-push 'submissions:count' '{}'
```

Then check by hand:

- sign in as an imported administrator with their old password;
- open a user with two-factor enabled and confirm their authenticator code is accepted;
- open an old submission and confirm the per-case table renders;
- open a contest's ranking page and compare it against the old site;
- open a problem with images in its statement and confirm they load from `infra/media/`.

The first of those is the one that matters most, because a password that does not verify means the hash import is
wrong, and everything else is easier to fix afterwards.
