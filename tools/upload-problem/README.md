# `upload-problem`

Publishes problems from a problem repository to a MOJ site: the statement, the
editorial, the statement images, the metadata and the test data. A single file,
`upload-problem.mjs`, with no dependencies. Node 24 and nothing else.

The site stores the test data and judges fetch it over HTTPS, so a repository
needs exactly two secrets: the site's URL and an API key.

[`actions/upload-problems`](../../actions/upload-problems/README.md) is a
GitHub Action wrapper around it. Use the action in CI and this script by hand.

## Usage

```sh
export JUDGE_URL=https://judge.example.org
export JUDGE_API_KEY=...

# One problem, statement and data
node upload-problem.mjs --problem-dir problems/aplusb

# Everything under a root, reporting only
node upload-problem.mjs --problems-root problems --dry-run

# The statement half alone, for a repository whose judges get data some other way
node upload-problem.mjs --problems-root problems --skip-data

# The data alone, after fixing a test case
node upload-problem.mjs --problem-dir problems/aplusb --data-only

# Only the problems a push touched
node upload-problem.mjs --problems-root problems --changed "$(git diff --name-only HEAD^ HEAD)"
```

The problem code is the directory's name. The script exits non-zero if anything
failed and prints the API's error message, so a failing upload fails the job.

A run says what it did, per problem:

```
aplusb: created "A plus B"
  data: published (14 files, 1.8 KB, sha256 a2d4358062e2)
mst: updated "Minimum spanning tree"
  data: unchanged (41 files, 5.0 MB, sha256 8f1c2d3e4f5a)

2 uploaded, 0 skipped, 0 failed.
Test data: 1 published, 1 unchanged, 0 without data.
```

## Flags

| Flag | Meaning |
| --- | --- |
| `--problem-dir <dir>` | A problem directory. Repeatable. |
| `--problems-root <dir>` | The directory the problem directories live in. |
| `--changed <list>` | Newline or comma separated changed paths; only the problem directories they touch are uploaded. |
| `--include <glob>` | Keep only problem codes matching the glob. Repeatable. |
| `--exclude <glob>` | Drop problem codes matching the glob. Repeatable. |
| `--registry <path>` | The image upload cache. Default `<problems-root>/.image-registry.json`. |
| `--skip-data` | Publish the statement and the metadata only. |
| `--data-only` | Publish the test data only, leaving the statement alone. |
| `--statement-only` | Send the statement and the editorial and nothing else. Implies `--skip-data`. |
| `--dry-run` | Resolve and report; send nothing. |
| `--json` | Print a machine-readable summary on the last line. |
| `--judge-url <url>` | Overrides `JUDGE_URL`. |
| `--api-key <key>` | Overrides `JUDGE_API_KEY`. |
| `-h`, `--help` | Print the flags and exit. |

`--data-only` contradicts both `--skip-data` and `--statement-only`, and saying
so is an error rather than a silent preference.

`--dry-run` never writes. It builds the archive, prints its hash, and asks the
site what it holds so it can tell you whether the upload would change anything.
With no credentials it skips that question and reports the local side alone, so
a dry run is also a way to see the hash without a key.

## Environment

| Variable | What it is |
| --- | --- |
| `JUDGE_URL` | The site's address, e.g. `https://judge.example.org`. The problems API is a Convex HTTP action, but the site publishes it on its own origin under `/api/problems/...`, so this is the address people browse. |
| `JUDGE_API_KEY` | An API key with the `problems:write` scope. Make one under Account, API tokens, or, as staff, at `/admin/api-keys`. |

A key never grants more than its owner has, so the account it belongs to needs
permission to edit the problems being uploaded, and permission to publish
problems if any `config.json` sets `"public": true`.

## What a problem directory holds

```
problems/
  aplusb/
    config.json          optional; the metadata
    statement.md         the statement, in MOJ's markdown
    editorial.md         optional; published as the problem's editorial
    diagram.png          referenced from the statement as ![](diagram.png)
    init.yml             the test data, published to the site
    tests/
  .image-registry.json   commit this: the sha-keyed image upload cache
```

A directory counts as a problem when it holds a `config.json` or a
`statement.md`, which is how a work in progress stays out of the upload.
`statment.md` is read as well, for repositories that spell it that way.

`config.json`:

```json
{
  "title": "A plus B",
  "authors": ["someone"],
  "points": 100,
  "timeLimit": 1,
  "pythonTimeLimit": 3,
  "memoryLimit": 512000,
  "shortCircuit": true,
  "public": true
}
```

Every key is optional except `title`, which is required the first time a problem
is uploaded. An absent key leaves that field as it is on the site, so a
statement-only change never disturbs the points or the limits, and `"authors":
[]` means "leave the authors alone" rather than "remove every author".

## Test data

The archive is everything in the problem directory except the statement half:
`statement.md` (and `statment.md`), `editorial.md` and `config.json` at the top
level, anything whose name starts with a dot, and `__pycache__` anywhere. So
`init.yml`, `tests/`, checkers, graders, generators and whatever else the data
references all go, with their paths relative to the problem directory. Anything
else sitting in the directory, a reference solution for instance, rides along;
it is a few kilobytes and the alternative is a second list of rules to keep.

A directory with no `init.yml` publishes no data at all, and says so. That is
what a statement-only problem looks like, and refusing to publish an archive
the judge cannot grade from is better than telling every judge to fetch one.

Publishing goes in three steps, which is what lets a large archive past an HTTP
body limit: the uploader asks the site for a one-time upload URL, sends the
bytes there, and then tells the site which stored blob is the problem's data,
with the hash, the size and the file count. The API key is sent to the site and
not to the upload URL.

### A deterministic archive

The hash of the archive is what decides whether anything is uploaded, so the
same data has to produce the same bytes on every machine. Everything that could
vary is pinned:

- entries are sorted by path, so the order the filesystem hands them back does
  not matter;
- every timestamp is the DOS epoch, 1980-01-01 00:00:00;
- the deflate level and window are written out rather than inherited, and a file
  that deflate does not shrink is stored;
- paths use forward slashes and no entry has an extra field.

The only thing besides the bytes that reaches the archive is the executable bit,
which git tracks, so a fresh clone hashes the same as the machine the data was
written on. Touching a file, cloning into another directory, or editing the
statement does not change the hash; editing a test case does.

The hash is the sha256 of the archive bytes, and the judge verifies it after
downloading, so a wrong hash is a loud grading error rather than silent
corruption.

One caveat: the deflate output comes from the Node runtime's zlib, so a
different Node build could in principle produce different bytes for the same
input. The cost of that is one unnecessary upload, not a wrong archive. Pin the
Node version in CI, which the action does, and it does not arise.

### Limits

The writer emits no zip64 records, which keeps it small and keeps the archive
readable by every unzipper. It refuses, with a message naming the file, an
archive that would need them:

- a single file of 4 GB or more;
- a total of 4 GB or more;
- more than 65535 files, where the answer is usually to pack the cases into a
  zip and name it with `init.yml`'s `archive` key, which counts as one file.

The archive is built in memory, so a problem with a gigabyte of cases wants a
gigabyte or two of RAM in whatever runs the upload.

Data that genuinely does not fit is data to distribute to the judges yourself.
[Problem repos and CI](../../docs/problems/repos-and-ci.md) has that path.

## Images

Local image references in `statement.md` and `editorial.md` are uploaded before
the statement is sent, and the reference is rewritten to the link the site
returns. Markdown and HTML forms are both handled:

```markdown
![A tree](tree.png)
<img src="tree.png" width="400">
```

Uploads are content-addressed, and `.image-registry.json` keeps the sha256 of
every file already sent. **Commit that file**: it is what stops every push
re-uploading every image. Remote references (`https://...`), root-relative paths
and `data:` URIs are left alone. A statement that points at a file which does
not exist is a warning, and the reference is left as it is.

## Tests

```sh
npm test --workspace tools/upload-problem
```

The zip writer is checked against `unzip -t` and Python's `zipfile`, and the
hash is checked for stability across runs with the file times changed under it.
