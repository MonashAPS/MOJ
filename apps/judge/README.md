# The MOJ judge

The grader. It is the judge-server, vendored as a git subtree of
<https://github.com/dmoj/judge-server.git> branch `master` under `judge-server/`, with a pull-mode packet manager
added so it fetches work from MOJ over HTTPS instead of waiting on a bridge socket. A judge needs no inbound port
and no static address, so one behind a home connection works the same as one beside the site.

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

Take the images from Docker Hub, not from the `ghcr.io` mirror: the mirror has not been rebuilt since March 2022
and its tier 1 image ships GCC 11, which fails the C++23 and C23 self-tests.

Judges are also given a tier in the staff console, which is a different thing. Work only goes to judges in the
lowest online tier, so a spare laptop on tier 2 stays idle until the dedicated box is gone.

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

`CAP_SYS_PTRACE` is what the sandbox needs to trace the processes it runs. The judge appears in Admin, Judges once
its executor self-tests finish, usually under a minute.

Add `-v /srv/moj/problems:/problems` if this judge also grades problems whose test data it holds itself, and
`--cpuset-cpus` to keep the sandbox off cores you need for something else.

| Variable | Default | Meaning |
| --- | --- | --- |
| `MOJ_URL` | | the site's Convex origin; unset runs the judge against an upstream bridge instead |
| `JUDGE_NAME`, `JUDGE_KEY` | | credentials from the staff console |
| `JUDGE_CONFIG` | `/problems/judge.yml` | written from the template on first start, then left alone |
| `JUDGE_API_HOST`, `JUDGE_API_PORT` | `127.0.0.1`, `9998` | the judge's local control API |
| `MOJ_DATA_CACHE` | `/judge-data-cache` | where fetched test data is unpacked |
| `MOJ_DATA_MAX_GB` | `20` | ceiling for that cache; `0` disables eviction |

## Test data

A problem's test data lives either on the judge or on the site.

On the judge, as it always has: a directory per problem code under `/problems` holding `init.yml` and its test
files, put there by whatever copies your problem repository around.

On the site, which is the normal case now: the claim names the sha256 of the archive the site holds, and the judge
downloads it once, checks the bytes against that hash, and keeps it in `MOJ_DATA_CACHE`. Later submissions for the
same hash use the cached copy; a new hash is downloaded again. A judge that grades only these needs no problem
tree at all, so mount an empty `/problems` and it fills its own cache as it goes.

Where a problem exists in both, the site's copy wins, so every judge in an estate grades the same bytes. Nothing on
local disk is written to or deleted.

The judge refuses to grade rather than grade the wrong thing: bytes that do not match the promised hash, an archive
with no `init.yml` at its root, or a member that would write outside the problem directory all end the submission
with an internal error naming the problem. A download that fails part way leaves the cached copy untouched.

## Tests

```bash
python3 -m unittest discover -s apps/judge/tests   # the cache, its guards and eviction, no Docker needed

python3 apps/judge/tests/e2e.py                    # against an already built moj-judge:tier1
python3 apps/judge/tests/e2e.py --build            # build first
python3 apps/judge/tests/e2e.py --port 3311 --network host
```

`e2e.py` runs the real image against `tests/mock_server.py` and grades ten submissions: accepted, wrong, timed out
and aborted from a local problem, then six covering site-owned data, including a first fetch, a cache hit, a
re-fetch after the hash changes, and an archive whose bytes do not match its hash.

It prefers `host.docker.internal` and falls back to host networking when the container cannot reach the host, which
is what happens where the firewall does not trust the docker bridge.

## Updating from upstream

```bash
git subtree pull --prefix apps/judge/judge-server https://github.com/dmoj/judge-server.git master --squash
```

MOJ's changes are commits inside the subtree touching four files: `dmoj/moj_packet.py` and `dmoj/moj_data.py` are
ours outright, and `dmoj/judge.py` and `dmoj/judgeenv.py` carry a few lines each, so those are the only places a
pull can conflict. Rebuild the image and run `tests/e2e.py` afterwards.
