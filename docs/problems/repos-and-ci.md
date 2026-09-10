# Problem repos and CI

A problem repository is a git repository holding problems, one directory per problem code. Its CI does two
independent things whenever a problem changes:

1. pushes the statement and the metadata to the site through the problems API, using `upload-problem.mjs`;
2. copies the test data to the judge boxes with rsync.

The order matters. The site half runs first, so that a brand new problem exists in the database before its data
lands on a judge. If the upload fails, the rsync is skipped, because data for a problem the site does not know
about is only going to confuse the judge's handshake.

## Repository layout

```
mcpc26/
  .github/workflows/ci.yml
  problems/
    template/                    an example, skipped by CI
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

Files split cleanly by destination. `config.json`, `statement.md`, `editorial.md` and anything the statement
references go to the site. `init.yml`, `tests/`, checkers, graders and generators go to the judges. Reference
solutions and generators' own sources are only for humans and stay in git.

A directory without a `config.json` is not uploaded to the site. That is how a work in progress lives in the
repository without appearing on the judge, and it is why the `template/` directory is skipped explicitly.

## Credentials

The upload needs an API key with the `problems:write` scope.

1. Sign in as a user who can edit the problems in question. A key never grants more than its owner has.
2. Open `/accounts/api/token/generate/`, or the **API keys** panel on **Edit profile**.
3. Create a key, tick **problems:write**, and copy it. Only the hash is stored, so it is shown once.
4. Put it in the problem repository as the `JUDGE_API_KEY` secret, and the site's base URL as `JUDGE_URL`.

For the rsync half you also need an SSH key that can write to the problems directory on each judge box. Add its
private half as `JUDGE_SSH_KEY` and the host and user as `JUDGE_HOST` and `JUDGE_USER`.

Keys belonging to a shared bot account are easier to rotate than a person's. Revoke a key from the same panel;
revocation takes effect on the next request.

## `upload-problem.mjs`

`upload-problem.mjs` lives in the MOJ repository at `tools/upload-problem/upload-problem.mjs`. It is a single file
with no dependencies, because Node 24 already has `fetch` and `FormData`, so problem repositories fetch it in CI
rather than vendoring a copy that drifts:

```bash
curl -fsSL -o upload-problem.mjs \
  https://raw.githubusercontent.com/MonashAPS/MOJ/main/tools/upload-problem/upload-problem.mjs
```

Pin the branch to a tag if you want the script to change only when you decide it does.

### Usage

```bash
export JUDGE_URL=https://judge.monashaps.com
export JUDGE_API_KEY=...

# Upload one problem directory.
node upload-problem.mjs --problem-dir problems/celebratedhours

# Show what would be sent without sending it.
node upload-problem.mjs --problem-dir problems/celebratedhours --dry-run

# Statement and editorial only, leaving every setting on the site alone.
node upload-problem.mjs --problem-dir problems/celebratedhours --statement-only
```

| Environment variable | Required | Meaning |
| --- | --- | --- |
| `JUDGE_URL` | yes | Base URL of the site, with no trailing slash. The script calls `$JUDGE_URL/api/problems/<code>`. |
| `JUDGE_API_KEY` | yes | An API key with the `problems:write` scope. Sent as `Authorization: Bearer`. |

The problem code is the directory's name. The title, points and limits come from `config.json`, the statement from
`statement.md`, and the editorial from `editorial.md` when that file exists and is not empty.

The script exits non-zero on any failure and prints the API's error message, so a failing upload fails the job.

### What it sends

One `PUT /api/problems/<code>` with a JSON body:

```json
{
  "name": "Celebrated Hours",
  "statement": "In the kingdom of MAPS...",
  "editorial": { "content": "Check the hour...", "isPublic": false },
  "points": 100,
  "timeLimit": 1,
  "memoryLimit": 256000,
  "shortCircuit": true,
  "isPublic": true,
  "authors": ["indra"],
  "testers": ["alice"],
  "languageLimits": {
    "python3": { "timeLimit": 3 },
    "pypy3": { "timeLimit": 3 }
  }
}
```

The endpoint creates the problem if the code is new and updates it otherwise. `name` is required on create.

### Partial update semantics

The API updates only the fields it is given, which is what lets a repository own some settings and the staff
console own the rest.

- A field that is absent is left unchanged.
- `authors: []` is treated as absent, so an empty array never clears the author list. Clear it in the staff
  console.
- `group`, `types`, `publishOn` and the allowed language list are create-only. On create they default to the
  `uncategorized` group and type, publish immediately, and allow every language. Later uploads never touch them,
  so a problem moved into a group or restricted to C++ in the staff console stays that way.
- `languageLimits` is rewritten whenever `timeLimit` or `pythonTimeLimit` is present in `config.json`, so removing
  `pythonTimeLimit` returns Python to the general limit instead of leaving the old value behind.
- `DELETE` is not supported. Retiring a problem is a staff console action, because deleting one would take its
  submissions with it.

### Images

Before sending the statement, the script scans it for local images: markdown `![alt](images/archery.jpg)` and HTML
`<img src="images/archery.jpg" width="400">`. Each local file is posted to:

```
POST /api/problems/<code>/images
Content-Type: multipart/form-data, field name "file"
```

which answers `{"status": 200, "link": "https://..."}`. The script rewrites that source in the statement to the
returned link, keeping any other attributes, and only then sends the statement. Absolute URLs are left alone.

Uploads are content-addressed, so re-uploading an unchanged image returns the existing link rather than making a
second copy. A statement that references a file which does not exist is an error, not a warning, because a broken
image on a contest problem is worse than a failed build.

## Example workflow

This is a complete `.github/workflows/ci.yml` for a problem repository. It uploads changed problems on a push to
`main`, then syncs the test data.

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  upload:
    name: Upload changed problems
    runs-on: ubuntu-latest
    concurrency: judge-upload
    if: >
      github.ref == 'refs/heads/main' &&
      !contains(github.event.head_commit.message, '[skip ci]') &&
      !contains(github.event.head_commit.message, '#skip-upload')
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: '24'

      - name: Detect changed problem directories
        id: detect
        run: |
          before='${{ github.event.before }}'
          after='${{ github.event.after }}'
          if [ "$before" = '0000000000000000000000000000000000000000' ]; then
            changed=$(git diff-tree --no-commit-id --name-only -r "$after" -- problems/)
          else
            changed=$(git diff --name-only "$before" "$after" -- problems/)
          fi

          dirs=$(printf '%s\n' "$changed" \
            | grep -E '^problems/[^/]+/(config\.json|statement\.md|editorial\.md|images/.*)$' \
            | cut -d/ -f2 \
            | grep -vx template \
            | sort -u \
            | while read -r d; do [ -f "problems/$d/config.json" ] && echo "$d"; done)

          {
            echo 'dirs<<EOF'
            echo "$dirs"
            echo 'EOF'
          } >> "$GITHUB_OUTPUT"

      - name: Fetch the uploader
        if: steps.detect.outputs.dirs != ''
        run: |
          curl -fsSL -o upload-problem.mjs \
            https://raw.githubusercontent.com/MonashAPS/MOJ/main/tools/upload-problem/upload-problem.mjs

      - name: Upload
        if: steps.detect.outputs.dirs != ''
        env:
          JUDGE_URL: ${{ vars.JUDGE_URL }}
          JUDGE_API_KEY: ${{ secrets.JUDGE_API_KEY }}
        run: |
          failed=''
          while read -r problem; do
            [ -z "$problem" ] && continue
            echo "::group::$problem"
            if node upload-problem.mjs --problem-dir "problems/$problem"; then
              echo "::endgroup::"
            else
              echo "::endgroup::"
              echo "::error::failed to upload $problem"
              failed="$failed $problem"
            fi
          done <<< '${{ steps.detect.outputs.dirs }}'
          [ -z "$failed" ] || { echo "failed:$failed"; exit 1; }

  deploy:
    name: Sync test data to the judges
    runs-on: ubuntu-latest
    needs: upload
    concurrency: judge-deploy
    if: >
      always() && !cancelled() &&
      (needs.upload.result == 'success' || needs.upload.result == 'skipped') &&
      github.ref == 'refs/heads/main' &&
      !contains(github.event.head_commit.message, '[skip ci]') &&
      !contains(github.event.head_commit.message, '#skip-deploy')
    steps:
      - uses: actions/checkout@v4

      - name: Load the deploy key
        run: |
          mkdir -p ~/.ssh
          printf '%s\n' "${{ secrets.JUDGE_SSH_KEY }}" > ~/.ssh/id_ed25519
          chmod 600 ~/.ssh/id_ed25519
          ssh-keyscan -H "${{ secrets.JUDGE_HOST }}" >> ~/.ssh/known_hosts

      - name: Rsync problems
        run: |
          rsync -avz --delete \
            --exclude '.git*' \
            --exclude 'config.json' \
            --exclude 'statement.md' \
            --exclude 'editorial.md' \
            --exclude 'images/' \
            --exclude 'sol.*' \
            --exclude 'judge.yml' \
            -e 'ssh -i ~/.ssh/id_ed25519 -o StrictHostKeyChecking=yes' \
            problems/ \
            "${{ secrets.JUDGE_USER }}@${{ secrets.JUDGE_HOST }}:~/problems/${{ github.event.repository.name }}/"
```

Some details worth keeping if you adapt it:

- `concurrency: judge-upload` and `concurrency: judge-deploy` stop two pushes from racing. Two rsyncs writing the
  same directory at once can leave a judge reading half a test set.
- The `--exclude` list keeps site-only files off the judges. They would be harmless, but a judge that copies
  gigabytes of images has less disk for the data it needs.
- `--delete` is what removes cases you deleted in git. Without it, an old `tests/9.in` stays on the judge forever
  and keeps getting graded.
- The commit-message escapes (`[skip ci]`, `#skip-upload`, `#skip-deploy`) exist for the times when you are fixing
  the repository itself rather than the problems.
- On a pull request the workflow does nothing except run whatever validation you add. Do not let pull requests
  push to a live judge.

### Validating before you push

Two checks worth adding to the pull request job, both cheap:

```bash
# Every problem directory that has config.json also parses as JSON and has a title.
for d in problems/*/; do
  [ -f "$d/config.json" ] || continue
  node -e 'const c=require("./"+process.argv[1]+"/config.json"); if(!c.title) {console.error(process.argv[1]+": no title"); process.exit(1)}' "$d"
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

## Syncing to more than one judge

Judges do not share problem data; each grades from its own disk. With several judge boxes, either run the rsync
step once per host in a matrix:

```yaml
    strategy:
      matrix:
        host: [judge1.example.org, judge2.example.org]
```

or rsync to one host and let the others pull from it on a timer. The site copes with judges that disagree about
which problems exist, because the handshake tells it what each one has, but a problem that has reached no judge
will queue forever, and a contest problem that has reached only the slow judge will grade slowly.

After a sync, judges pick up new problem directories on their next handshake. Restarting a judge container forces
one immediately:

```bash
docker restart moj-judge
```
