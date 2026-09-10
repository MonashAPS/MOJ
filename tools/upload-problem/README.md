# `upload-problem`

Publishes problems from a problem repository to a MOJ judge over the problems
API: one `PUT /api/problems/<code>` per problem and one `POST` per statement
image. A single file, `upload-problem.mjs`, with no dependencies — Node 24 and
nothing else.

[`actions/upload-problems`](../../actions/upload-problems/README.md) is a
GitHub Action wrapper around it. Use the action in CI and this script by hand.

## Usage

```sh
export JUDGE_URL=https://judge.example.org
export JUDGE_API_KEY=...

# One problem
node upload-problem.mjs --problem-dir problems/aplusb

# Everything under a root, reporting only
node upload-problem.mjs --problems-root problems --dry-run

# Just the text, leaving points and limits alone
node upload-problem.mjs --problem-dir problems/aplusb --statement-only

# Only the problems a push touched
node upload-problem.mjs --problems-root problems --changed "$(git diff --name-only HEAD^ HEAD)"
```

The problem code is the directory's name. The script exits non-zero if anything
failed and prints the API's error message, so a failing upload fails the job.

## Flags

| Flag | Meaning |
| --- | --- |
| `--problem-dir <dir>` | A problem directory. Repeatable. |
| `--problems-root <dir>` | The directory the problem directories live in. |
| `--changed <list>` | Newline or comma separated changed paths; only the problem directories they touch are uploaded. |
| `--include <glob>` | Keep only problem codes matching the glob. Repeatable. |
| `--exclude <glob>` | Drop problem codes matching the glob. Repeatable. |
| `--registry <path>` | The image upload cache. Default `<problems-root>/.image-registry.json`. |
| `--statement-only` | Send the statement and the editorial and nothing else. |
| `--dry-run` | Resolve and report; send nothing. |
| `--json` | Print a machine-readable summary on the last line. |
| `--judge-url <url>` | Overrides `JUDGE_URL`. |
| `--api-key <key>` | Overrides `JUDGE_API_KEY`. |
| `-h`, `--help` | Print the flags and exit. |

## Environment

| Variable | What it is |
| --- | --- |
| `JUDGE_URL` | The judge's address, e.g. `https://judge.example.org`. The problems API is a Convex HTTP action, but the judge publishes it on its own origin under `/api/problems/...`, so this is the address people browse. |
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
    init.yml             test data; rsynced to the judge, not sent here
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
is uploaded. An absent key leaves that field as it is on the judge, so a
statement-only change never disturbs the points or the limits, and `"authors":
[]` means "leave the authors alone" rather than "remove every author".

## Images

Local image references in `statement.md` and `editorial.md` are uploaded before
the statement is sent, and the reference is rewritten to the link the judge
returns. Markdown and HTML forms are both handled:

```markdown
![A tree](tree.png)
<img src="tree.png" width="400">
```

Uploads are content-addressed, and `.image-registry.json` keeps the sha256 of
every file already sent. **Commit that file**: it is what stops every push
re-uploading every image. Remote references (`https://…`), root-relative paths
and `data:` URIs are left alone. A statement that points at a file which does
not exist is an error, not a warning.

## Tests

```sh
npm test --workspace tools/upload-problem
```
