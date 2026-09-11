# Problem repos and CI

A problem repository is a git repository holding problems, one directory per problem code. Its CI publishes each
changed problem to the site: the statement, the editorial, the images and the metadata through the problems API,
and the test data as one archive through the same API with the same key.

The site is where the test data lives. Judges fetch what they need over HTTPS when they are handed a submission
and keep a local cache, so a new judge needs nothing but a name and a key, and every judge grades a problem from
the same bytes. A repository needs two secrets: the site's URL and an API key.

Whole workflow: a checkout and a `uses:`.

## Repository layout

```
problems-2026/
  .github/workflows/upload.yml
  problems/
    .image-registry.json         the image upload cache, committed
    template/                    an example, skipped: it has no config.json
    celebratedhours/
      config.json
      statement.md
      editorial.md
      images/archery.jpg
      init.yml
      tests/1.in
      tests/1.out
      sol.cpp
  README.md
```

Everything in that problem directory goes to the site. `config.json`, `statement.md`, `editorial.md` and the
images are the statement half, stored as problem fields; `init.yml`, `tests/` and anything else are the test data
half, stored as one archive. Reference solutions are in the archive too, which is the price of having one rule
rather than a list.

A directory counts as a problem when it holds a `config.json` or a `statement.md`. That is how a work in progress
lives in the repository without appearing on the site, and it is why a `template/` directory with neither is
skipped without having to be named. A problem directory with no `init.yml` publishes no test data and says so in
the log, which is what a statement-only problem looks like.

See [problem format](/problems/format) for what goes in each file.

## Credentials

The upload needs an API key with the `problems:write` scope.

1. Sign in as someone who can edit the problems in question. A key never grants more than its owner has.
2. Open `/admin/api-keys` if you are staff, or `/accounts/api/token/generate/` otherwise.
3. Create a key with `problems:write` and copy it. Only its hash is stored, so it is shown once.
4. Put it in the problem repository as the `JUDGE_API_KEY` secret.

`JUDGE_URL` is the second secret, and it is simply the address you browse the site on, e.g.
`https://judge.example.org`. The problems API is a Convex HTTP action underneath, but the site publishes it on its
own origin at `/api/problems/...`, so a problem repository never needs a second hostname. `/admin/api-keys` prints
the right value for the deployment you are looking at.

That is the whole set. Publishing test data uses the same key as the statement, so there is no SSH key to hold and
no judge hostname to keep in step with the judges you actually run.

A key belonging to a shared bot account is easier to rotate than a person's. Revoke a key from the same page;
revocation takes effect on the next request.

## The reusable action

```yaml
uses: MonashAPS/MOJ/actions/upload-problems@main
```

It sets up Node, works out which problem directories the push touched, uploads each one, and writes a table to the
job summary.

### Example workflow

`.github/workflows/upload.yml` in the problem repository:

```yaml
name: Upload problems

on:
  push:
    branches: [main]
    paths: ["problems/**"]
  workflow_dispatch:

concurrency:
  group: upload-problems
  cancel-in-progress: false

jobs:
  upload:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          # The action compares the push's before and after SHAs, so it needs
          # more than the tip commit.
          fetch-depth: 0

      - uses: MonashAPS/MOJ/actions/upload-problems@main
        with:
          judge-url: ${{ secrets.JUDGE_URL }}
          api-key: ${{ secrets.JUDGE_API_KEY }}
```

Secrets to add under Settings, Secrets and variables, Actions:

| Secret | What it is |
| --- | --- |
| `JUDGE_URL` | The site's address, e.g. `https://judge.example.org`. |
| `JUDGE_API_KEY` | An API key with the `problems:write` scope. |

The `concurrency` group is worth keeping. Two pushes racing each other means two publishes of the same problem,
and the loser wins by arriving second.

### Inputs

| Input | Default | What it does |
| --- | --- | --- |
| `judge-url` | required | The site's address, e.g. `https://judge.example.org`. |
| `api-key` | required | API key with the `problems:write` scope. Use a repository secret. |
| `problems-dir` | `problems` | The directory the problem directories live in. |
| `only-changed` | `true` | Upload only the problems this push touched, using the event's before and after SHAs. Falls back to every problem when the event carries no usable range, such as a new branch or a manual run. |
| `skip-data` | `false` | Publish the statements and the metadata only, leaving the site's test data alone. |
| `include` | | Newline-separated globs; only matching problem codes are uploaded. |
| `exclude` | | Newline-separated globs; matching codes are skipped. |
| `dry-run` | `false` | Resolve and report, send nothing. |
| `registry` | `<problems-dir>/.image-registry.json` | The image upload cache. |
| `node-version` | `24` | The Node version to run the uploader with. |

There are five more, `rsync-host`, `rsync-user`, `rsync-key`, `rsync-target` and `rsync-delete`, for repositories
that put the data on the judges themselves. [Distributing the data yourself](#distributing-the-data-yourself)
covers them.

### Outputs

`uploaded`, `skipped`, `failed` and `data` are JSON lists:

```json
[{ "code": "aplusb", "created": false, "name": "A plus B", "statement": true,
   "data": { "hash": "a2d4...", "size": 1871, "fileCount": 14, "status": "published" } }]
[{ "code": "mst", "reason": "dry-run", "data": null }]
[{ "code": "coconut", "error": "coconut: HTTP 422 A new problem requires a name." }]
[{ "code": "aplusb", "hash": "a2d4...", "size": 1871, "fileCount": 14, "status": "published" }]
```

`data` gathers the test data results across the run: `published` when the archive was sent, `unchanged` when the
site already held those bytes, `pending` on a dry run.

The job fails when anything failed, and every run writes a table to the job summary saying, per problem, what
happened to the statement, what happened to the data, and the archive's size and hash.

## What is in the archive

Everything in the problem directory except the statement half. That is: all of it, minus `statement.md`,
`editorial.md` and `config.json` at the top level, minus anything whose name begins with a dot, minus
`__pycache__` anywhere. `init.yml`, `tests/`, checkers, graders, generators and any archive named by `init.yml`'s
`archive` key all go, at their paths relative to the problem directory.

The uploader asks the site what it holds before it sends anything, and an archive whose hash already matches is
not uploaded. That is what keeps a push that touched one statement from pushing a gigabyte of unchanged cases.

### The hash

The hash is the sha256 of the archive bytes, and it is the whole mechanism: the site stores it, the claim tells
the judge which hash to grade at, and the judge verifies the bytes it downloaded against it. For that to be worth
anything the same data has to produce the same archive everywhere, so the writer pins everything that could vary:
entries sorted by path, every timestamp the DOS epoch, fixed compression settings, forward slashes, no extra
fields. The executable bit is the only thing besides the file contents that reaches the archive, and git tracks
that.

So: touching a file does not change the hash, cloning the repository somewhere else does not change the hash,
editing the statement does not change the hash. Editing a test case does.

The writer emits no zip64 records, so it refuses an archive that would need them: a file of 4 GB or more, a total
of 4 GB or more, or more than 65535 files. The message names the file. Packing the cases into a zip and naming it
with `init.yml`'s `archive` key turns a directory of a hundred thousand files into one, and data that genuinely
does not fit is data to distribute yourself.

### On the judge

A judge handed a submission for a problem the site holds data for downloads the archive once, verifies the hash,
extracts it into its cache and grades from there; the next submission at the same hash grades straight from the
cache. The cache has a size ceiling and evicts what has been used least recently. The judge's own copy of a
problem, if it has one, is used only when the site holds nothing. See
[`apps/judge/README.md`](https://github.com/MonashAPS/MOJ/blob/main/apps/judge/README.md) for the cache settings
and what a judge does when a download fails.

## Partial update semantics

The API updates only the fields it is given, which is what lets a repository own some settings and the staff
console own the rest.

- A field that is absent is left unchanged.
- `authors: []` is treated as absent, so an empty array never clears the author list. Clear it in the staff
  console. The same is true of `testers` and `curators`.
- `group`, `types`, `publishOn` and the allowed language list are create-only. On create they default to the
  `uncategorized` group and type, publish immediately, and allow every language. Later uploads never touch them,
  so a problem moved into a group or restricted to C++ in the staff console stays that way.
- The Python language limits are rewritten whenever `timeLimit` or `pythonTimeLimit` is present in `config.json`,
  so removing `pythonTimeLimit` returns Python to the general limit rather than leaving the old value behind.
- Making a problem public needs the permission to publish problems. Without it the upload is refused rather than
  silently ignored.
- An unknown username or an unknown language key is a warning on the response, not a failure.
- Publishing test data replaces the archive the site held for that problem; there is no merge. The old blob is
  deleted once the new one is recorded.
- `DELETE` is not supported. Retiring a problem is a staff console action, because deleting one would take its
  submissions with it.

## Images

Before sending a statement, the uploader scans it for local images: markdown `![alt](images/archery.jpg)` and HTML
`<img src="images/archery.jpg" width="400">`. Each local file is posted to the images endpoint, and the source in
the statement is rewritten to the link that comes back, keeping any other attributes. Absolute URLs, root-relative
paths and `data:` URIs are left alone. A reference to a file that does not exist is reported as a warning and
left as it is.

Uploads are content-addressed by the sha256 of the bytes, so re-uploading an unchanged image returns the existing
link rather than making a second copy.

On top of that, the uploader keeps `.image-registry.json` in the problems directory, keyed by file hash.
**Commit that file.** It is what stops every push re-uploading every image. It starts with a dot, so it never
reaches the test data archive either.

## Running the uploader by hand

The action is a thin wrapper around `tools/upload-problem/upload-problem.mjs` in the MOJ repository, a single file
with no dependencies. Its own README lists every flag:

```bash
export JUDGE_URL=https://judge.example.org
export JUDGE_API_KEY=...

# One problem, statement and data
node upload-problem.mjs --problem-dir problems/celebratedhours

# Everything under a root, reporting only
node upload-problem.mjs --problems-root problems --dry-run

# The data alone, after fixing a test case
node upload-problem.mjs --problem-dir problems/celebratedhours --data-only
```

| Option | Meaning |
| --- | --- |
| `--problem-dir <dir>` | A problem directory. Repeatable. |
| `--problems-root <dir>` | The directory problem directories live in. |
| `--changed <list>` | Newline or comma separated changed paths; only the problem directories they touch are uploaded. |
| `--include <glob>`, `--exclude <glob>` | Filter by problem code. Repeatable. |
| `--registry <path>` | The image cache file. |
| `--skip-data` | Publish the statement and the metadata only. |
| `--data-only` | Publish the test data only. |
| `--statement-only` | Send the statement and the editorial and nothing else. |
| `--dry-run` | Resolve and report, send nothing. |
| `--json` | Print a machine-readable summary on the last line. |
| `--judge-url`, `--api-key` | Override `JUDGE_URL` and `JUDGE_API_KEY`. |

The problem code is the directory's name. The script exits non-zero on any failure and prints the API's error
message, so a failing upload fails the job.

A dry run is honest: it builds the archive, prints the file count, the size and the hash, asks the site what it
holds so it can say whether the upload would change anything, and writes nothing. With no key set it skips the
question and reports the local side alone, which is a way to see a problem's hash without credentials at all.

## Validating before you push

Two checks worth adding to the pull request job, both cheap:

```bash
# Every problem directory that has config.json parses as JSON and has a title.
for d in problems/*/; do
  [ -f "$d/config.json" ] || continue
  node -e 'const c=require("./"+process.argv[1]+"/config.json"); if(!c.title){console.error(process.argv[1]+": no title");process.exit(1)}' "$d"
done

# Every init.yml parses and names files that exist.
python3 -c '
import glob, os, sys, yaml
bad = False
for init in glob.glob("problems/*/init.yml"):
    d = os.path.dirname(init)
    cfg = yaml.safe_load(open(init))
    cases = cfg.get("test_cases") or []
    if isinstance(cases, dict):
        continue
    for case in cases:
        for c in case.get("batched", [case]):
            for key in ("in", "out"):
                if c.get(key) and not cfg.get("archive") and not os.path.exists(os.path.join(d, c[key])):
                    print(f"{init}: missing {c[key]}")
                    bad = True
sys.exit(1 if bad else 0)
'
```

Do not let pull requests publish to a live site. Run the action with `dry-run: true` on a pull request if you want
the report without the write.

## Distributing the data yourself

Publishing to the site is the default and the path everything else is written for, but a judge still grades from
its own disk when the site holds no data for a problem, and the action can still put the data there. Set the rsync
inputs, and turn the publish off so the two do not disagree:

```yaml
      - uses: MonashAPS/MOJ/actions/upload-problems@main
        with:
          judge-url: ${{ secrets.JUDGE_URL }}
          api-key: ${{ secrets.JUDGE_API_KEY }}
          skip-data: true
          rsync-host: ${{ secrets.JUDGE_HOST }}
          rsync-user: judge
          rsync-key: ${{ secrets.JUDGE_SSH_KEY }}
```

| Input | Default | What it does |
| --- | --- | --- |
| `rsync-host` | | The judge host to copy the problem directory to. Empty skips the copy. |
| `rsync-user` | | SSH user on that host. Required with `rsync-host`. |
| `rsync-key` | | Private SSH key for that host. Required with `rsync-host`. |
| `rsync-target` | `~/problems/<repo name>/` | Directory on the judge host. |
| `rsync-delete` | `true` | Pass `--delete`, so test data you removed in git disappears on the judge. |

Two more secrets then: `JUDGE_HOST` and `JUDGE_SSH_KEY`, a private key authorised on that host.

The copy is the whole problems directory apart from `.git` and the image registry, so the judge also ends up with
the statements and the images. They are harmless there; if disk on the judge is tight, narrow it with your own
step instead.

With several judge boxes, either run the action once per host in a matrix, or copy to one host and let the others
pull from it on a timer. Judges pick up new problem directories on their next handshake; restarting a judge
container forces one immediately:

```bash
docker restart moj-judge
```

If you leave `skip-data` off while syncing, both copies exist and the site's copy is what gets graded, because a
claim that names a hash tells the judge to use it. That is a fine way to migrate: publish to the site, watch the
grading, then stop the sync.
