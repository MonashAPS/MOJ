# Problem repos and CI

A problem repository holds one directory per problem code. Its CI publishes each changed problem: the statement,
editorial, images and metadata as fields on the problem, and everything else as one test data archive. Judges
fetch archives over HTTPS and cache them, so a new judge needs nothing but a name and a key.

A directory counts as a problem when it holds a `config.json` or a `statement.md`, so a `template/` directory
with neither is skipped. A problem directory with no `init.yml` publishes no test data.

## Credentials

| Secret | Value |
| --- | --- |
| `JUDGE_URL` | The address you browse the site on, such as `https://judge.example.org`. |
| `JUDGE_API_KEY` | An API key with the `problems:write` scope. |

Create the key at `/admin/api-keys/`, or `/accounts/api/token/generate/` if you are not staff, as someone who
may edit the problems in question. It is shown once, and that page prints the base URL for the deployment.

## The workflow

```yaml
# .github/workflows/upload.yml
on:
  push: { branches: [main], paths: ["problems/**"] }
  workflow_dispatch:

concurrency:
  group: upload-problems

jobs:
  upload:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: MonashAPS/MOJ/actions/upload-problems@main
        with:
          judge-url: ${{ secrets.JUDGE_URL }}
          api-key: ${{ secrets.JUDGE_API_KEY }}
```

`fetch-depth: 0` is required: the action compares the push's before and after SHAs. Keep the `concurrency`
group, or two pushes race and the loser wins by arriving second.

| Input | Default | Effect |
| --- | --- | --- |
| `judge-url`, `api-key` | required | The site's address, and a key with `problems:write`. |
| `problems-dir` | `problems` | Where the problem directories live. |
| `only-changed` | `true` | Upload only what this push touched. Falls back to everything for a new branch or a manual run. |
| `skip-data` | `false` | Publish statements and metadata only. |
| `include`, `exclude` | | Newline-separated globs over problem codes. |
| `dry-run` | `false` | Resolve and report, send nothing. |
| `registry` | `<problems-dir>/.image-registry.json` | The image upload cache. |
| `node-version` | `24` | Node version for the uploader. |

Outputs `uploaded`, `skipped`, `failed` and `data` are JSON lists, every run writes a per-problem table to the
job summary, and the job fails if anything failed.

::: tip
Run the action with `dry-run: true` on pull requests. Never let a pull request publish to a live site.
:::

## The archive

Everything in the problem directory goes in except `statement.md`, `editorial.md` and `config.json` at the top
level, anything whose name starts with a dot, and `__pycache__`. Images are uploaded for the statement **and**
carried in the archive; reference solutions ride along too.

It is built deterministically — entries sorted by path, timestamps fixed at the DOS epoch, fixed compression, and
the executable bit as the only thing besides content and path that reaches it — so its sha256 is stable. That
hash is what the site stores, what a claim names, and what the judge verifies its download against. Editing a
statement does not change it; editing a test case does. The uploader asks the site what it holds first, so an
unchanged archive is not uploaded.

::: warning
The writer emits no zip64 records and refuses an archive of 65,536 or more files, a member of 4 GB or more, or a
total of 4 GB or more. Pack the cases into a zip named by `init.yml`'s `archive` key, which counts as one file.
:::

Publishing replaces the archive the site held; there is no merge, and the old blob is deleted. Retiring a problem
is a staff console action.

## Images

The uploader scans the statement for local images, in markdown and `<img src="...">` form, posts each one, and
rewrites the source to the link that comes back, keeping other attributes. Absolute URLs, root-relative paths and
`data:` URIs are left alone; a missing file is a warning.

`.image-registry.json` caches those uploads, keyed by the image's path relative to the registry file and holding
the file's hash and its link. **Commit it**, or every push re-uploads every image. It starts with a dot, so it
never reaches the archive.

## By hand

The action wraps `tools/upload-problem/upload-problem.mjs`, one file with no dependencies. `--help` lists every
flag; the useful ones are `--problem-dir`, `--problems-root`, `--include`, `--exclude`, `--skip-data`,
`--data-only`, `--statement-only`, `--dry-run` and `--json`.

```bash
export JUDGE_URL=https://judge.example.org
export JUDGE_API_KEY=...
node upload-problem.mjs --problems-root problems --dry-run
```

A dry run builds the archive, prints the file count, size and hash, and asks the site whether the upload would
change anything. With no key set it reports the local side alone.

## Distributing the data yourself

A judge still grades from its own disk when the site holds nothing for a problem, and the action can put it
there: set `skip-data: true` so the two do not disagree, then `rsync-host`, `rsync-user` and `rsync-key`, with
`rsync-target` (default `~/problems/<repo name>/`) and `rsync-delete` (default `true`). The site's copy is graded
wherever both exist. Judges pick up new local problem directories at their next handshake, which
`docker restart moj-judge` forces.
