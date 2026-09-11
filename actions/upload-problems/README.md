# `upload-problems`

Publishes a problem repository to a MOJ site: statements, editorials, statement
images, problem metadata and test data, all through the problems API.

```yaml
uses: MonashAPS/MOJ/actions/upload-problems@main
```

Two secrets and nothing else. The site stores the test data and the judges fetch
it, so a repository needs no SSH key and no judge hostname.

## Example workflow

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
| `JUDGE_URL` | The site's address, e.g. `https://judge.example.org` |
| `JUDGE_API_KEY` | An API key with the `problems:write` scope, made in the site's account settings |

`JUDGE_URL` is the address people browse the site on. The problems API is a
Convex HTTP action behind the scenes, but the site publishes it on its own
origin under `/api/problems/...`, so a repository never needs a second hostname.

## Repository layout

One directory per problem, named after the problem code:

```
problems/
  aplusb/
    config.json          optional; the metadata
    statement.md         required; the statement, in MOJ's markdown
    editorial.md         optional; published as the problem's editorial
    diagram.png          referenced from the statement as ![](diagram.png)
    init.yml             the test data, published to the site
    tests/
  .image-registry.json   commit this: the sha-keyed image upload cache
```

`config.json` carries the problem's metadata:

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
is uploaded. A key that is absent leaves that field as it is on the site, so a
statement-only change never disturbs the points or the limits. `"authors": []`
means "leave the authors alone", not "remove every author".

`pythonTimeLimit` becomes the `python3` and `pypy3` language limits; when it is
absent those limits follow `timeLimit`.

## Test data

Everything in a problem directory except `statement.md`, `editorial.md`,
`config.json`, dotfiles and `__pycache__` goes into one zip and is published to
the site alongside the statement. The archive is built deterministically, so its
sha256 changes only when the data changes, and the action asks the site for the
current hash before sending anything: an unchanged problem uploads nothing.

A directory with no `init.yml` publishes no data, which is what a statement-only
problem looks like.

Set `skip-data: true` to leave the site's copy alone, for a repository that gets
its data to the judges some other way. See
[`tools/upload-problem`](../../tools/upload-problem/README.md) for the archive's
contents, the determinism rules and the size limits.

## Inputs

| Input | Default | What it does |
| --- | --- | --- |
| `judge-url` | required | The site's address |
| `api-key` | required | API key with the `problems:write` scope |
| `problems-dir` | `problems` | Directory the problem directories live in |
| `only-changed` | `true` | Upload only the problems this push touched |
| `skip-data` | `false` | Publish statements and metadata only |
| `include` | | Newline separated globs; only matching codes are uploaded |
| `exclude` | | Newline separated globs; matching codes are skipped |
| `dry-run` | `false` | Resolve and report, send nothing |
| `registry` | `<problems-dir>/.image-registry.json` | The image upload cache |
| `node-version` | `24` | Node version to run the uploader with |

For repositories that distribute their own data there are five more, described
under [distributing the data yourself](#distributing-the-data-yourself):
`rsync-host`, `rsync-user`, `rsync-key`, `rsync-target` and `rsync-delete`.

## Outputs

`uploaded`, `skipped`, `failed` and `data` are JSON lists:

```json
[{ "code": "aplusb", "created": false, "name": "A plus B", "statement": true,
   "data": { "hash": "a2d4...", "size": 1871, "fileCount": 14, "status": "published" } }]
[{ "code": "mst", "reason": "dry-run", "data": null }]
[{ "code": "coconut", "error": "coconut: HTTP 422 A new problem requires a name." }]
[{ "code": "aplusb", "hash": "a2d4...", "size": 1871, "fileCount": 14, "status": "published" }]
```

`data` collects the test data results from every problem in the run. `status` is
`published` when the archive was sent, `unchanged` when the site already held
those bytes, and `pending` on a dry run.

The job fails when anything failed. Every run writes a table to the job summary
naming, per problem, what happened to the statement, what happened to the data,
and the archive's size and hash.

## Images

Local image references in `statement.md` and `editorial.md` are uploaded before
the statement is sent, and the reference is rewritten to the link the site
returns. Both markdown and HTML forms are handled:

```markdown
![A tree](tree.png)
<img src="tree.png" width="400">
```

Uploads are keyed by the file's sha256 in `.image-registry.json`. Commit that
file: it is what stops every push re-uploading every image. Remote references
(`https://...`), absolute paths and `data:` URIs are left alone.

## Distributing the data yourself

A judge can still grade from its own disk, and the action can still put the data
there over SSH. Set the rsync inputs and the problem directory is copied to the
judge host after the upload:

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
| `rsync-host` | | Judge host to copy the problem directory to. Empty skips the copy. |
| `rsync-user` | | SSH user on that host. Required with `rsync-host`. |
| `rsync-key` | | Private SSH key for that host. Required with `rsync-host`. |
| `rsync-target` | `~/problems/<repo name>/` | Directory on the judge host |
| `rsync-delete` | `true` | Pass `--delete`, so removed test data disappears |

`skip-data: true` is the honest pairing: if the site holds data for a problem,
every judge grades from the site's copy, so a repository that syncs its own data
should not also publish it. Leaving both on is allowed, and the site's copy is
what gets graded.

## Running the uploader by hand

The action is a thin wrapper around
[`tools/upload-problem`](../../tools/upload-problem/README.md), a single file
with no dependencies:

```sh
export JUDGE_URL=https://judge.example.org
export JUDGE_API_KEY=...

# One problem, statement and data
node upload-problem.mjs --problem-dir problems/aplusb

# Everything, but only report what would happen
node upload-problem.mjs --problems-root problems --dry-run

# The data alone, after fixing a test case
node upload-problem.mjs --problem-dir problems/aplusb --data-only
```
