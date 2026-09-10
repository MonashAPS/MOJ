# Problem repos and CI

A problem repository is a git repository holding problems, one directory per problem code. Its CI does two
independent things whenever a problem changes:

1. pushes the statement, the editorial, the images and the metadata to the site through the problems API;
2. copies the test data to the judge boxes with rsync.

The order matters. The site half runs first, so that a new problem exists in the database before its data lands on
a judge.

Both halves are one reusable action, so a problem repository's whole workflow is a checkout and a `uses:`.

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

Files split by destination. `config.json`, `statement.md`, `editorial.md` and anything the statement references go
to the site. `init.yml`, `tests/`, checkers, graders and generators go to the judges. Reference solutions are only
for humans and stay in git.

A directory counts as a problem when it holds a `config.json` or a `statement.md`. That is how a work in progress
lives in the repository without appearing on the site, and it is why a `template/` directory with neither is
skipped without having to be named.

See [problem format](/problems/format) for what goes in each file.

## Credentials

The upload needs an API key with the `problems:write` scope.

1. Sign in as someone who can edit the problems in question. A key never grants more than its owner has.
2. Open `/admin/api-keys` if you are staff, or `/accounts/api/token/generate/` otherwise.
3. Create a key with `problems:write` and copy it. Only its hash is stored, so it is shown once.
4. Put it in the problem repository as the `JUDGE_API_KEY` secret.

`JUDGE_URL` is the second secret, and it is the one people get wrong. **It is the Convex site origin, not the
address you browse the site on.** The problems API is a Convex HTTP action, so the base URL looks like
`https://convex-site.judge.example.org`. `/admin/api-keys` prints the right value for the deployment you are
looking at.

For the rsync half you also need an SSH key that can write to the problems directory on the judge box. Add its
private half as `JUDGE_SSH_KEY` and the host as `JUDGE_HOST`.

A key belonging to a shared bot account is easier to rotate than a person's. Revoke a key from the same page;
revocation takes effect on the next request.

## The reusable action

```yaml
uses: MonashAPS/MOJ/actions/upload-problems@main
```

It sets up Node, works out which problem directories the push touched, uploads each one, writes a table to the job
summary, and then, if the rsync inputs are present, syncs the test data to the judge host.

### Inputs

| Input | Default | What it does |
| --- | --- | --- |
| `judge-url` | required | Base URL of the problems API: the Convex site origin. |
| `api-key` | required | API key with the `problems:write` scope. Use a repository secret. |
| `problems-dir` | `problems` | The directory the problem directories live in. |
| `only-changed` | `true` | Upload only the problems this push touched, using the event's before and after SHAs. Falls back to every problem when the event carries no usable range, such as a new branch or a manual run. |
| `include` | | Newline-separated globs; only matching problem codes are uploaded. |
| `exclude` | | Newline-separated globs; matching codes are skipped. |
| `dry-run` | `false` | Resolve and report, send nothing. Also skips the rsync. |
| `registry` | `<problems-dir>/.image-registry.json` | The image upload cache. |
| `rsync-host` | | The judge host to sync test data to. Empty skips the sync entirely. |
| `rsync-user` | | SSH user on that host. Required if `rsync-host` is set. |
| `rsync-key` | | Private SSH key for that host. Required if `rsync-host` is set. |
| `rsync-target` | `~/problems/<repo name>/` | Directory on the judge host. |
| `rsync-delete` | `true` | Pass `--delete`, so test data you removed in git disappears on the judge. |
| `node-version` | `24` | The Node version to run the uploader with. |

### Outputs

`uploaded`, `skipped` and `failed` are JSON lists:

```json
[{ "code": "aplusb", "created": false, "name": "A plus B" }]
[{ "code": "mst", "reason": "dry-run" }]
[{ "code": "coconut", "error": "coconut: HTTP 422 A new problem requires a name." }]
```

The job fails when anything failed, and every run writes a table to the job summary saying what was created,
updated, skipped or failed and why.

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
          problems-dir: problems
          only-changed: true
          rsync-host: ${{ secrets.JUDGE_HOST }}
          rsync-user: judge
          rsync-key: ${{ secrets.JUDGE_SSH_KEY }}
```

Secrets to add under Settings, Secrets and variables, Actions:

| Secret | What it is |
| --- | --- |
| `JUDGE_URL` | The problems API base, the Convex site origin. |
| `JUDGE_API_KEY` | An API key with the `problems:write` scope. |
| `JUDGE_HOST` | The judge host to rsync test data to. |
| `JUDGE_SSH_KEY` | A private SSH key authorised on that host. |

Leave `rsync-host` out to upload statements only.

The `concurrency` group is worth keeping. Two pushes racing each other means two rsyncs writing the same directory
at once, which can leave a judge reading half a test set.

The rsync copies the whole problems directory apart from `.git` and the image registry, so the judge also ends up
with the statements and the images. They are harmless there; if disk on the judge is tight, narrow it with your
own step instead.

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
- `DELETE` is not supported. Retiring a problem is a staff console action, because deleting one would take its
  submissions with it.

## Images

Before sending a statement, the uploader scans it for local images: markdown `![alt](images/archery.jpg)` and HTML
`<img src="images/archery.jpg" width="400">`. Each local file is posted to the images endpoint, and the source in
the statement is rewritten to the link that comes back, keeping any other attributes. Absolute URLs, root-relative
paths and `data:` URIs are left alone.

Uploads are content-addressed by the sha256 of the bytes, so re-uploading an unchanged image returns the existing
link rather than making a second copy.

On top of that, the uploader keeps `.image-registry.json` in the problems directory, keyed by file hash.
**Commit that file.** It is what stops every push re-uploading every image, and it is excluded from the rsync so
it never reaches a judge.

A statement that references a file which does not exist is an error, not a warning, because a broken image on a
contest problem is worse than a failed build.

## Running the uploader by hand

The action is a thin wrapper around `tools/upload-problem/upload-problem.mjs` in the MOJ repository, a single file
with no dependencies:

```bash
export JUDGE_URL=https://convex-site.judge.example.org
export JUDGE_API_KEY=...

# One problem
node upload-problem.mjs --problem-dir problems/celebratedhours

# Everything under a root, reporting only
node upload-problem.mjs --problems-root problems --dry-run

# Just the text, leaving points and limits alone
node upload-problem.mjs --problem-dir problems/celebratedhours --statement-only
```

| Option | Meaning |
| --- | --- |
| `--problem-dir <dir>` | A problem directory. Repeatable. |
| `--problems-root <dir>` | The directory problem directories live in. |
| `--changed <list>` | Newline or comma separated changed paths; only the problem directories they touch are uploaded. |
| `--include <glob>`, `--exclude <glob>` | Filter by problem code. Repeatable. |
| `--registry <path>` | The image cache file. |
| `--statement-only` | Send the statement and the editorial and nothing else. |
| `--dry-run` | Resolve and report, send nothing. |
| `--json` | Print a machine-readable summary on the last line. |
| `--judge-url`, `--api-key` | Override `JUDGE_URL` and `JUDGE_API_KEY`. |

The problem code is the directory's name. The script exits non-zero on any failure and prints the API's error
message, so a failing upload fails the job.

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

Do not let pull requests push to a live judge. Run the action with `dry-run: true` on a pull request if you want
the report without the write.

## Syncing to more than one judge

Judges do not share problem data; each grades from its own disk. With several judge boxes, either run the action
once per host in a matrix, or sync to one host and let the others pull from it on a timer.

The site copes with judges that disagree about which problems exist, because the handshake tells it what each one
has. But a problem that has reached no judge will queue forever, and a contest problem that has reached only the
slow judge will grade slowly.

After a sync, judges pick up new problem directories on their next handshake. Restarting a judge container forces
one immediately:

```bash
docker restart moj-judge
```
