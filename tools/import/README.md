# @moj/import

Imports a DMOJ MariaDB dump into MOJ: Convex documents for everything in
`convex/schema.ts`, and Better Auth rows in Postgres for accounts, passwords,
two factor secrets and passkeys.

Nothing about the importer needs a running MySQL server. It parses the
`mysqldump` output directly, streaming, so a multi gigabyte dump never has to
fit in memory.

## Getting a dump

On the current MAPS web box:

```
mysqldump --single-transaction --quick --hex-blob --default-character-set=utf8mb4 \
  --routines=false --triggers=false --events=false \
  --databases dmoj | gzip > dump-$(date +%F).sql.gz
```

`--hex-blob` matters: `judge_profile.totp_key` and `judge_profile.scratch_codes`
are binary columns holding Fernet tokens, and hex is the only form the parser
can read back byte for byte. `--single-transaction` keeps the dump consistent
without locking the site.

Copy the result to `tools/import/dump-<date>.sql.gz`, which is gitignored.
`infra/scripts/pull-production.sh` does the copy, the media directory and the
problem data in one go.

The dump is production data. Never commit it, any row from it, or anything
derived from it. `tools/import/out/`, `tools/import/dump*.sql.gz` and
`tools/import/secrets*` are all in `.gitignore`; check `git status` before every
commit anyway.

## The secret key file

TOTP secrets and scratch codes in DMOJ are encrypted with Fernet, keyed by the
Django `SECRET_KEY` through django-fernet-fields' HKDF. Put that key in
`tools/import/secrets.env` (gitignored), in the same format Django uses:

```
SECRET_KEY=the-value-from-the-production-settings-file
```

`DJANGO_SECRET_KEY=` is accepted as well. Without this file the import still
runs, and every user with two factor enabled is reported as needing to enrol
again.

## Environment

Read from the environment, or from `.env.local` and `.env` in any parent
directory:

- `CONVEX_SELF_HOSTED_URL` and `CONVEX_SELF_HOSTED_ADMIN_KEY`: the self hosted
  Convex deployment and its admin key. Needed unless you pass `--dry-run`.
- `DATABASE_URL`: Postgres for the Better Auth tables. Run the Drizzle
  migrations first; the importer writes rows, it never creates tables.
- `AUTH_SECRET` (or `BETTER_AUTH_SECRET`): the app secret Better Auth uses to
  encrypt the TOTP secret and the backup codes. It must be the same value the
  web app runs with, or two factor logins fail after the import.

## Running it

```
npm run import -w tools/import -- --dump tools/import/dump-2026-09-07.sql.gz \
  --secret-key-file tools/import/secrets.env --dry-run --report
```

Options:

| Option | Meaning |
| --- | --- |
| `--dump <file>` | the dump, `.sql` or `.sql.gz`. Required. |
| `--secret-key-file <file>` | file holding `SECRET_KEY=...`. |
| `--tables a,b` | only fill these Convex tables. |
| `--dry-run` | transform and write JSONL only. No Convex, no Postgres. |
| `--out <dir>` | output directory, default `tools/import/out`. |
| `--report` | print the long report, including unmapped columns. |
| `--resume` | skip tables already finished in `<out>/state.json`. |
| `--clear` | clear each Convex table before inserting into it. |
| `--force-extract` | re-parse the dump even if `<out>/raw` looks current. |
| `--fresh` | forget `<out>/state.json` and treat every table as unloaded. |
| `--skip-auth` | do not write the Better Auth tables. |
| `--skip-convex` | write only the Better Auth tables. |

Do a `--dry-run --report` first and read the report. Then run the same command
without `--dry-run`.

## What happens, in order

1. **Extract.** The dump is streamed once and split into `out/raw/<mysql
   table>.jsonl`, one JSON object per row, plus `out/raw/_manifest.json` with
   the column names and types from the `CREATE TABLE` statements. Binary columns
   become `{"$hex": "..."}`. Re-running reuses this unless the dump changed or
   `--force-extract` is given.
2. **Transform and load.** Tables are processed in dependency order, and each
   one writes `out/docs/<convex table>.jsonl` and pushes batches of 200
   documents through `convex/importer.ts` (`insertBatch`). The returned Convex
   ids fill a legacy id map, which is how the next table resolves its foreign
   keys. Order:

   languages, problemTypes, problemGroups, licenses, profiles, organizations,
   organizationMemberships, classes, organizationRequests, problems,
   problemTranslations, problemClarifications, languageLimits, solutions,
   problemPointsVotes, problemData, problemTestCases, judges, runtimeVersions,
   contestTags, contests, contestProblems, contestParticipations, submissions,
   submissionSources, submissionTestCases, ratings, contestMoss, blogPosts,
   comments, commentVotes, commentLocks, tickets, ticketMessages,
   navigationBar, miscConfig, flatPages, revisions.

   Two departures from the order in the spec, both forced by references:
   `contestTags` runs before `contests` because a contest points at its tags,
   and `blogPosts` runs before `comments` because a blog comment points at its
   post. `profiles.currentParticipationId` points forward at a participation, so
   it is applied at the end with `patchBatch`.
3. **Better Auth.** `user`, `account`, `twoFactor` and `passkey` rows are
   upserted into Postgres. This step is skipped by `--dry-run`, which still
   builds and counts the rows so the report is complete.
4. **Report.** `out/report.json` and a summary on stdout.

## Resuming

Every finished table is recorded in `out/state.json`, and that file is carried
forward by every run against the same dump, whether or not the run resumes.
Re-running with `--resume` skips the finished tables and pulls their legacy id
map back from Convex (the `mapping` query), so references still resolve. A dry
run resumes from the JSONL it wrote instead. Resuming a load with a dry run
state file, or the other way round, is refused. `--fresh` forgets the state file
and treats every table as unloaded.

`--tables` works the same way: tables that are not selected are skipped, and
their id maps come from whatever is already in Convex. So importing a single
table later works as long as everything it points at is already loaded.

A run only inserts, it never deletes, so importing a table that is already
loaded duplicates it. Use `--clear` together with `--tables` to reload one
table, and keep in mind that clearing a table other rows point at, `profiles`
above all, leaves those references dangling, because the ids change when the
rows come back. If the thing you need to reload is referenced widely, clear and
import everything in one run instead.

## What ends up where

- Everything in section 4 of `docs/SPEC.md` that has a DMOJ counterpart, with
  `legacyId` set to the old primary key. `profiles.legacyUserId` is the old
  `auth_user.id`.
- Better Auth `user.id` is `u<auth_user.id>`, which is also
  `profiles.userId`. `account` rows carry the Django password hash verbatim
  (`pbkdf2_sha256$...`), so the custom verifier in `apps/web/src/auth/server.ts`
  can accept old passwords and rewrite them on first login.
- `judge_profile.api_token` becomes `profiles.legacyApiTokenHash`. It is the
  HMAC of the old token, kept only so an old token can be recognised. Better
  Auth API keys are issued fresh.
- Comments carry `targetType` and `targetKey` instead of DMOJ's `page` string:
  `p:code` becomes `problem` plus the problem code, `c:key` becomes `contest`
  plus the contest key, `s:code` becomes `solution` plus the problem code, and
  `b:id` becomes `blog` plus the Convex id of the post.
- Tickets keep their generic link as `linkedType` and `linkedKey`. A ticket
  about a problem gets `problem` plus the problem code. Any other content type
  keeps the legacy numeric id in `linkedKey` and is listed in the report.
- Revisions come from `reversion_version`, restricted to problems, contests and
  comments. The serialised Django snapshot is stored as it is, with the revision
  comment as `reason`.

## What does not import

- **Sessions.** `django_session` is dropped. Everyone signs in again after the
  cutover.
- **Registration keys.** `registration_registrationprofile` is dropped. A user
  who never activated has `is_active = 0` in Django, which becomes
  `emailVerified = false` in Better Auth, so they get the normal Better Auth
  verification mail instead of the old activation link.
- **Social logins.** `social_auth_*` is dropped. There is no social provider in
  MOJ.
- Django bookkeeping: `django_admin_log`, `django_migrations`, `django_site`,
  `django_flatpage_sites`, `django_redirect`, `impersonate_impersonationlog`.
- Fields with no home in the new schema, all listed by `--report`:
  `judge_profile.user_script` (custom user JavaScript is gone),
  `judge_profile.last_totp_timecode` and `is_webauthn_enabled` (Better Auth owns
  that state), `judge_organization.creation_date`, `auth_user.first_name`,
  `last_name` and `last_login`, the mptt bookkeeping columns (`lft`, `rght`,
  `tree_id`) which are replaced by `parentId`, and `reversion_version.format`,
  `object_repr` and `db`.

## Write rate

A self hosted Convex deployment caps writes, 4 MiB per second by default. The
loader catches `TooManyWrites` and retries the batch with exponential backoff,
printing a line each time it does, so a large table simply takes a little
longer. Nothing is written twice: a batch is one transaction, and a rejected one
wrote nothing.

## Things worth knowing before you look at the report

- **Problems with no date.** DMOJ allows `judge_problem.date` to be null, and
  the new schema does not, so those become 0. On the 2026-09-07 dump that is 176
  of 312 problems. They sort last under "recently added" until someone sets a
  date.
- **Contest label scripts.** DMOJ's `problem_label_script` is a Lua snippet.
  There is no equivalent, so a contest with one gets `labelScheme: "custom"` and
  an empty `customLabels`, and is listed in the report. Contests without a
  script get `labelScheme: "letters"`.
- **Contest durations.** Django stores `DurationField` as microseconds on
  MariaDB. `timeLimit` is converted to seconds.
- **Judges.** Imported offline, `tier` 0, no current submission. They come back
  online when the judge container handshakes.
- **Freeze settings.** `freezeMinutes` is 0 and `blindDuringFreeze` is false for
  every imported contest; DMOJ has no such fields.
- **Emails.** Better Auth requires a unique email. An empty or duplicated
  address becomes `<username>.<legacyUserId>@imported.invalid` and is reported.
  Those users sign in by username and can set a real address afterwards.
- **Two factor.** Only users with `is_totp_enabled` and a `totp_key` get a
  `twoFactor` row. The TOTP secret and the scratch codes are decrypted with the
  Django key and re-encrypted with `AUTH_SECRET` the way Better Auth does
  (XChaCha20-Poly1305 under SHA-256 of the secret, hex encoded), with the
  scratch codes stored as an encrypted JSON array, which is Better Auth's
  default `storeBackupCodes: "encrypted"` layout. DMOJ scratch codes are 16
  character base32 strings and keep that shape.
- **Passkeys.** `judge_webauthncredential.cred_id` is already base64url, which
  is what Better Auth stores in `credentialID`. `public_key` is base64url of the
  COSE key and is re-encoded as standard base64, which is what the passkey
  plugin expects. `deviceType` is `multiDevice` and `backedUp` is false because
  DMOJ never recorded either.
- **Unresolved references** in the report are references whose target row is
  gone from the dump. On the 2026-09-07 dump the only ones are 45
  `reversion_version` rows pointing at problems and contests that were deleted,
  and they are dropped.

## Better Auth column lists

These match `apps/web/drizzle/0000_aberrant_rage.sql`, the schema Better Auth
1.7 generates here with the `username`, `twoFactor`, `passkey`, `admin`,
`apiKey`, `bearer` and `jwt` plugins plus MOJ's extra user fields. Drizzle names
columns in snake_case.

- `"user"`: `id`, `name`, `email`, `email_verified`, `image`, `created_at`,
  `updated_at`, `username`, `display_username`, `two_factor_enabled`, `role`,
  `banned`, `ban_reason`, `ban_expires`, `is_staff`, `is_superuser`, `timezone`,
  `preferred_language`, `organization_slugs`.
- `"account"`: `id`, `account_id`, `provider_id`, `user_id`, `password`,
  `created_at`, `updated_at`.
- `"two_factor"`: `id`, `secret`, `backup_codes`, `user_id`, `verified`,
  `failed_verification_count`, `locked_until`.
- `"passkey"`: `id`, `name`, `public_key`, `user_id`, `credential_id`,
  `counter`, `device_type`, `backed_up`, `transports`, `created_at`, `aaguid`.

The MOJ specific user columns come from the dump as well: `is_staff` and
`is_superuser` from `auth_user`, `timezone` and `preferred_language` (the
language key, for example `PY3`) from `judge_profile`, and `organization_slugs`
from the user's organisations, written as the comma separated list of slugs the
registration form uses.

Every write is an upsert on `id`, so the step is safe to repeat. Before writing,
the importer reads `information_schema.columns` for each table: a missing table
or a missing required column stops the run with a clear message, and a column
the deployed schema does not have yet is dropped from the statement and listed
in the output.

## Tests

```
npm test -w tools/import
```

Covers the parser (quotes, escapes, hex blobs, doubled quotes, huge multi row
inserts, chunk boundaries), the transforms over a hand written fixture dump, the
loader against a fake Convex client, the SQL builder against a fake Postgres,
and the crypto. The Fernet test checks against a token produced by Python's
`cryptography` with django-fernet-fields' HKDF, and the Better Auth test checks
against a value produced by better-auth itself. Both use throwaway keys
generated for the test; no production value appears anywhere in this package.
