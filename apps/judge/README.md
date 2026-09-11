# The MOJ judge

The grader. It is the judge-server, vendored as a git subtree of
<https://github.com/dmoj/judge-server.git> branch `master` under `judge-server/`, with a pull-mode packet manager
added so it fetches work from MOJ over HTTPS.

```
apps/judge/
  Dockerfile          builds FROM dmoj/runtimes-${TIER} on Docker Hub
  entrypoint.sh       renders /problems/judge.yml, then runs the judge in pull mode
  judge.yml.template  id, key and problem_storage_globs
  judge-server/       the subtree
  tests/              a mock of MOJ's judge API and an end to end test against a real container
```

The protocol itself is documented in [architecture](https://monashaps.github.io/MOJ/guide/architecture), the
problem format in [problem format](https://monashaps.github.io/MOJ/problems/format).

## Tiers

The base image decides which languages exist. Pick one at build time with `--build-arg TIER=`.

| Tier | Runtimes | Size |
| --- | --- | --- |
| `tier1` | C through C23, C++03 through C++23, Java 8, Python 2 and 3, PyPy 3, Pascal, Perl, x64 assembly, AWK, sed, plain text | about 2.7 GB built |
| `tier2` | Tier 1 plus the mid-popularity runtimes | larger |
| `tier3` | Everything, including Clang, Node.js, Lean 4, ALGOL 68 and LLVM IR | about 18 GB to pull |

Use the Docker Hub images, not the `ghcr.io` mirror, which still ships GCC 11 and fails the C++23 and C23
self-tests.

The tier set in the staff console is separate: work goes to judges in the lowest online tier first.

## Building

From the repository root, so the subtree is in the build context:

```bash
docker build --build-arg TIER=tier1 -t moj-judge:tier1 apps/judge
```

## Running

Create the judge first in the staff console, under Admin, Judges. It gives you a name and a key; the site stores
only `sha256(key)` and shows the key once.

```bash
docker run -d --restart unless-stopped --name moj-judge \
  --cap-add SYS_PTRACE \
  -v moj-judge-data:/judge-data-cache \
  -e MOJ_URL=https://convex-site.judge.example.org \
  -e JUDGE_NAME=judge1 \
  -e JUDGE_KEY=... \
  moj-judge:tier1
```

`CAP_SYS_PTRACE` is required by the sandbox. The judge shows up in Admin, Judges once its self-tests finish,
usually under a minute.

Add `-v /srv/moj/problems:/problems` for problems whose test data this judge holds itself, and `--cpuset-cpus` to
pin it to particular cores.

| Variable | Default | Meaning |
| --- | --- | --- |
| `MOJ_URL` | | the site's Convex origin; unset runs the judge against an upstream bridge instead |
| `JUDGE_NAME`, `JUDGE_KEY` | | credentials from the staff console |
| `JUDGE_CONFIG` | `/problems/judge.yml` | written from the template on first start, then left alone |
| `JUDGE_API_HOST`, `JUDGE_API_PORT` | `127.0.0.1`, `9998` | the judge's local control API |
| `MOJ_DATA_CACHE` | `/judge-data-cache` | where fetched test data is unpacked |
| `MOJ_DATA_MAX_GB` | `20` | ceiling for that cache; `0` disables eviction |

## Test data

Test data comes from one of two places.

**The site.** The claim names the sha256 of the archive the site holds. The judge downloads it once, checks the
bytes against that hash and keeps it in `MOJ_DATA_CACHE`; later submissions at the same hash use the cached copy.
Mount an empty `/problems` and the judge fills its own cache as it goes.

**The judge.** A directory per problem code under `/problems`, each holding `init.yml` and its test files.

Where both exist the site's copy is used. Local files are only ever read.

The judge reports an internal error instead of grading when the bytes do not match the hash, the archive has no
`init.yml` at its root, or a member would write outside the problem directory. A download that fails part way
leaves the cached copy alone.

## Tests

```bash
python3 -m unittest discover -s apps/judge/tests   # the cache, its guards and eviction, no Docker needed

python3 apps/judge/tests/e2e.py                    # against an already built moj-judge:tier1
python3 apps/judge/tests/e2e.py --build            # build first
python3 apps/judge/tests/e2e.py --port 3311 --network host
```

`e2e.py` runs the real image against `tests/mock_server.py` and grades ten submissions: accepted, wrong, timed out
and aborted from a local problem, then six for site-owned data covering a first fetch, a cache hit, a re-fetch
after the hash changes, and an archive whose bytes do not match its hash.

It falls back to host networking when the container cannot reach `host.docker.internal`.

## Updating from upstream

```bash
git subtree pull --prefix apps/judge/judge-server https://github.com/dmoj/judge-server.git master --squash
```

MOJ's changes are commits inside the subtree touching four files: `dmoj/moj_packet.py` and `dmoj/moj_data.py` are
ours outright, `dmoj/judge.py` and `dmoj/judgeenv.py` carry a few lines each. Rebuild the image and run
`tests/e2e.py` afterwards.
