# `upload-problems`

Push a problem repository to a MOJ judge: statements, editorials, statement
images and problem metadata over the problems API, and, optionally, the test
data over rsync.

This replaces the club's Playwright uploader
(`frontend-automation/scripts/create-problem.mjs`), which drove the Django admin
form in a headless browser. The API is a plain `PUT`, so a push takes seconds
and does not break when the admin template changes.

```yaml
uses: MonashAPS/MOJ/actions/upload-problems@main
```

## Repository layout

One directory per problem, named after the problem code:

```
problems/
  aplusb/
    config.json          optional; the metadata
    statement.md         required; the statement, in MOJ's markdown
    editorial.md         optional; published as the problem's editorial
    diagram.png          referenced from the statement as ![](diagram.png)
    init.yml             test data, rsynced to the judge
    tests/
  .image-registry.json   commit this: the sha-keyed image upload cache
```

`config.json` carries the same keys the old uploader read:

```json
{
  "title": "A plus B",
  "authors": ["swofty"],
  "points": 100,
  "timeLimit": 1,
  "pythonTimeLimit": 3,
  "memoryLimit": 512000,
  "shortCircuit": true,
  "public": true
}
```

Every key is optional except `title`, which is required the first time a problem
is uploaded. A key that is absent leaves that field as it is on the judge, so a
statement-only change never disturbs the points or the limits. `"authors": []`
means "leave the authors alone", not "remove every author".

`pythonTimeLimit` becomes the `python3` and `pypy3` language limits; when it is
absent those limits follow `timeLimit`.

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
          problems-dir: problems
          only-changed: true
          rsync-host: ${{ secrets.JUDGE_HOST }}
          rsync-user: judge
          rsync-key: ${{ secrets.JUDGE_SSH_KEY }}
```

Secrets to add under Settings, Secrets and variables, Actions:

| Secret | What it is |
| --- | --- |
| `JUDGE_URL` | `https://judge.monashaps.com` |
| `JUDGE_API_KEY` | An API key with the `problems:write` scope, made in the judge's account settings |
| `JUDGE_HOST` | The judge host to rsync test data to |
| `JUDGE_SSH_KEY` | A private SSH key authorised on that host |

Leave `rsync-host` out to upload statements only.

## Inputs

| Input | Default | What it does |
| --- | --- | --- |
| `judge-url` | required | Base URL of the judge |
| `api-key` | required | API key with the `problems:write` scope |
| `problems-dir` | `problems` | Directory the problem directories live in |
| `only-changed` | `true` | Upload only the problems this push touched |
| `include` | — | Newline separated globs; only matching codes are uploaded |
| `exclude` | — | Newline separated globs; matching codes are skipped |
| `dry-run` | `false` | Resolve and report, send nothing |
| `registry` | `<problems-dir>/.image-registry.json` | The image upload cache |
| `rsync-host` | — | Judge host for the test data sync; empty skips the sync |
| `rsync-user` | — | SSH user on that host |
| `rsync-key` | — | Private SSH key for that host |
| `rsync-target` | `~/problems/<repo name>/` | Directory on the judge host |
| `rsync-delete` | `true` | Pass `--delete`, so removed test data disappears |
| `node-version` | `24` | Node version to run the uploader with |

## Outputs

`uploaded`, `skipped` and `failed` are JSON lists:

```json
[{ "code": "aplusb", "created": false, "name": "A plus B" }]
[{ "code": "mst", "reason": "dry-run" }]
[{ "code": "coconut", "error": "coconut: HTTP 422 A new problem requires a name." }]
```

The job fails when anything failed. Every run writes a table to the job summary.

## Images

Local image references in `statement.md` and `editorial.md` are uploaded before
the statement is sent, and the reference is rewritten to the link the judge
returns. Both markdown and HTML forms are handled:

```markdown
![A tree](tree.png)
<img src="tree.png" width="400">
```

Uploads are keyed by the file's sha256 in `.image-registry.json`. Commit that
file: it is what stops every push re-uploading every image. Remote references
(`https://…`), absolute paths and `data:` URIs are left alone.

## Running the uploader by hand

The action is a thin wrapper around
[`tools/upload-problem/upload-problem.mjs`](../../tools/upload-problem/upload-problem.mjs),
which has no dependencies:

```sh
export JUDGE_URL=https://judge.monashaps.com
export JUDGE_API_KEY=...

# One problem
node upload-problem.mjs --problem-dir problems/aplusb

# Everything, but only report what would happen
node upload-problem.mjs --problems-root problems --dry-run

# Just the text, leaving points and limits alone
node upload-problem.mjs --problem-dir problems/aplusb --statement-only
```
