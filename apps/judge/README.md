# The MOJ judge

This directory builds the grader. It is the DMOJ judge-server, vendored as a git subtree under
`judge-server/`, with one file added so it can talk to MOJ instead of a DMOJ bridge. Everything else in the
subtree is upstream; see `UPSTREAM.md` for exactly what has been changed and which upstream pull requests
have been pulled in early.

```
apps/judge/
  Dockerfile          builds FROM ghcr.io/dmoj/runtimes-${TIER}
  entrypoint.sh       renders /problems/judge.yml, then runs the judge in pull mode
  judge.yml.template  id, key and problem_storage_globs
  judge-server/       the subtree
  tests/              a mock of MOJ's judge API and an end to end test against a real container
  UPSTREAM.md         subtree provenance
```

## How the DMOJ judge works

### The sandbox

Submissions run under cptbox, a small ptrace and seccomp supervisor written in C and Cython that lives in
`judge-server/dmoj/cptbox/`. Every submission gets its own process, traced from the first instruction. A
seccomp filter allows a fixed list of syscalls outright and traps the rest to the supervisor, which decides
per call whether to permit it, and for path-taking calls resolves the path and checks it against a filesystem
policy built from the executor's declared read and write sets. A denied call becomes a protection fault: the
process is killed and the case reports IR with feedback naming the syscall. The supervisor also enforces the
CPU time limit, a wall clock limit (three times the CPU limit by default), the address space limit, and an
output size limit, and it reports peak memory and voluntary and involuntary context switches back to the
grader. Running this needs `CAP_SYS_PTRACE`, which is why the container is started with `--cap-add
SYS_PTRACE`.

Because the sandbox is per process rather than per container, one judge grades one submission at a time. Add
throughput by running more judges, not by making one judge concurrent.

### Executors

An executor is a Python class under `judge-server/dmoj/executors/` that knows how to turn a source string
into something runnable and how to launch it: the compiler command and flags, the interpreter and its
loader script, which directories the compiler and the runtime are allowed to read, how to parse a runtime
version out of `--version`, and a small self-test program. `PY3`, `CPP20`, `JAVA8` and the rest are all just
executor classes. At startup the judge loads every executor, runs its self-test, and keeps the ones that
work; the rest are reported as unavailable and the site will not route submissions in those languages to
this judge. The key the site uses (`PY3`, `CPP17`, ...) is the executor's module name.

`dmoj-autoconf` walks the same executors looking for runtimes on the machine and writes the result to
`/judge-runtime-paths.yml`. The Docker build runs it once so the image ships a resolved runtime map instead
of probing on every start.

### The problem format

A problem is a directory whose name is the problem code, holding an `init.yml` and its test data. The judge
finds problems by globbing `problem_storage_globs` for `init.yml`. A dotted code maps to nested directories,
so `algo101.a1.knapsack` lives at `/problems/algo101/a1/knapsack/`.

`init.yml` is DMOJ's format. The interesting keys:

- `test_cases`: an ordered list. A plain entry is one case, with `in` and `out` naming files relative to the
  problem directory (or entries in `archive`, a zip in the same directory), plus `points`.
- `batched`: an entry containing a list of cases instead of an `in`/`out` pair is a batch. Cases inherit
  `points` and most other keys from the batch, so `points` goes on the batch and applies to the whole thing.
  A batch scores all or nothing: the site collapses it to the minimum points and maximum total across its
  cases. The judge short-circuits the rest of a batch as soon as one of its cases fails, reporting the
  remainder as `SC`. `dependencies` on a batch lists earlier batch numbers that must have passed for it to
  run at all.
- `pretest_test_cases`: cases run instead of the real ones when the submission is a contest pretest.
- `checker`: how output is compared. The default `standard` ignores trailing whitespace on each line and
  trailing blank lines. `floats` takes a precision argument, `identical` compares byte for byte, `linecount`,
  `sorted` and `unordered` do what they say. `bridged` runs a compiled checker binary (testlib-style, or one
  of the other supported contest formats) and passes it the input, the contestant's output and the answer.
  `custom_judge` points at a Python file that implements `check()` itself.
- `interactive`: the problem is graded by an interactor, a program the judge compiles and runs with its
  stdin and stdout wired to the submission's stdout and stdin. The interactor decides the verdict. Use
  `unbuffered: true` with these unless the interactor flushes carefully.
- `signature_grader`: the submission provides a function rather than a program, and the judge compiles it
  against a header and a supplied main.
- `generator`: a program the judge compiles and runs to produce input for cases that have no `in` file.
- `time_limit`, `memory_limit`, `output_prefix_length`, `output_limit_length`, `wall_time_factor`,
  `unbuffered`, `symlinks`, `hints`.

`infra/problems/aplusb/` is a worked example: two batches, one of sample cases worth nothing and one of
scored cases worth everything, plus a statement, a reference solution and the `config.json` a problem
repository publishes with.

### Grading

The judge controller forks a worker process per submission. The worker compiles the source (a compile
failure ends the submission with a compile error), then walks the flattened case list, grading one case at a
time and streaming results back to the controller over a pipe: `GRADING_BEGIN`, then `BATCH_BEGIN`, a
`RESULT` per case, `BATCH_END`, and finally `GRADING_END`. The controller turns each of those into an
outgoing packet. Verdicts are a bitmask, so a case can be several things at once; a timed-out case is TLE
and WA together, because the checker is skipped once a case is known to have failed.

## How MOJ's pull protocol works

DMOJ's judge connects out to a bridge on TCP 9999 and waits for the site to push submissions down that
socket. MOJ has no bridge. The site is a Convex deployment reachable only over HTTPS, so the judge asks for
work instead. `judge-server/dmoj/moj_packet.py` is a drop-in replacement for `dmoj.packet.PacketManager`
that implements this; `dmoj/judge.py` selects it when `MOJ_URL` is set and is otherwise untouched, so the
same image can still run against a DMOJ bridge.

Every request carries `judgeName` and `judgeKey`, in the JSON body for POSTs and in the query string for the
one GET. The site checks `sha256(judgeKey)` against the judge record and refuses blocked judges.

The sequence:

1. **Handshake.** `POST /judge/handshake` with every problem the judge can see and its directory mtime, and
   every executor that passed its self-test with its runtime versions. The site marks the judge online and
   records what it can grade. Failure is retried with backoff from four seconds to a minute, forever.
2. **Heartbeat.** `POST /judge/heartbeat` every ten seconds with the one-minute load average. The site uses
   the gap between heartbeats to notice a judge that has died mid-submission and requeue its work. When the
   problem directory changes on disk, the same endpoint carries the new problem list.
3. **Claim.** `POST /judge/claim` every 500 milliseconds while idle. The site returns the next queued
   submission this judge is able to grade, or null. Errors back off exponentially to five seconds. After a
   submission finishes the judge claims again immediately rather than waiting out the poll interval.
4. **Grade.** The judge grades exactly as it would have with a pushed submission, and every packet the
   grader produces becomes a `POST /judge/event`. Test case results are queued and flushed every 250
   milliseconds, and forcibly at batch boundaries and at the end of grading, so one event usually carries
   several cases.
5. **Abort.** While a submission is in flight, `GET /judge/abort?submissionId=` once a second. When it comes
   back true the judge kills the running process, the case in progress is discarded, and the submission ends
   with `submission-terminated`.
6. **Disconnect.** `POST /judge/disconnect` on a clean shutdown.

If the site is unreachable the judge does not exit. Claims back off and retry, events retry with backoff and
are eventually dropped with an error in the log rather than wedging the grading thread, and a submission
already being graded runs to completion.

### Wire format

`POST /judge/handshake`

```json
{
  "judgeName": "local",
  "judgeKey": "...",
  "problems": [["aplusb", 1789036959.9853778]],
  "executors": {"C": [["gcc", [11]]], "PY3": [["python3", [3, 9, 10]]]}
}
```

`problems` is a list of pairs, the problem code and the mtime of its directory. `executors` maps the language
key to a list of pairs, a runtime name and its version as a list of integers.

returns `{"ok": true, "judgeId": "..."}`.

`POST /judge/heartbeat`

```json
{"judgeName": "local", "judgeKey": "...", "load": 0.42}
```

returns `{"ok": true, "serverTime": 1757500000000}`. An update to the problem set adds `"problems"` in the
handshake's shape; an update to the runtimes adds `"executors"`.

`POST /judge/claim`

```json
{"judgeName": "local", "judgeKey": "..."}
```

returns either `{"submission": null}` or

```json
{
  "submission": {
    "submissionId": 1,
    "problemCode": "aplusb",
    "languageKey": "PY3",
    "source": "a, b = map(int, input().split())\nprint(a + b)\n",
    "timeLimit": 1.0,
    "memoryLimit": 262144,
    "shortCircuit": false,
    "meta": {"pretestsOnly": false, "inContest": null, "attemptNo": 1, "user": 1, "userNotes": ""}
  }
}
```

`timeLimit` is seconds and `memoryLimit` is kilobytes, both already resolved against any per-language
override. `meta` is translated into the dashed keys DMOJ's problem configs expect (`pretests-only`,
`in-contest`, `attempt-no`, `user`, `user-notes`), so a problem's dynamic `init.yml` keys keep working.

`POST /judge/event`

```json
{"judgeName": "local", "judgeKey": "...", "submissionId": 1, "event": {"type": "grading-begin", "pretested": false}}
```

`event.type` is the discriminator. The shapes:

| type | payload |
| --- | --- |
| `grading-begin` | `{"pretested": bool}` |
| `batch-begin` | none |
| `batch-end` | none |
| `test-case-status` | `{"cases": [...]}` |
| `grading-end` | none |
| `compile-error` | `{"log": string}` |
| `compile-message` | `{"log": string}` |
| `internal-error` | `{"message": string}` |
| `submission-terminated` | none |

A case in `test-case-status` is

```json
{
  "position": 1,
  "status": 0,
  "time": 0.016396197,
  "memory": 9644,
  "points": 0,
  "totalPoints": 0,
  "output": "3\n",
  "feedback": "",
  "extendedFeedback": "",
  "voluntaryContextSwitches": 359,
  "involuntaryContextSwitches": 3,
  "runtimeVersion": "python3 3.9.10"
}
```

`position` is 1-based across the whole submission, not per batch. `status` is DMOJ's bitmask, and the first
bit that matches in this order decides the verdict: 4 TLE, 8 MLE, 64 OLE, 2 RTE, 16 IR, 1 WA, 32 SC,
otherwise AC. Cases routinely carry several bits, because the checker is skipped once a case is known to have
failed and its WA bit is set anyway: a submission killed at the time limit reports 7, TLE and RTE and WA
together, and decodes to TLE. A case skipped by short-circuiting reports 32 and still carries the batch's
`totalPoints`. `time` is seconds and `memory` kilobytes. `output` is trimmed to the problem's
`output_prefix_length`.

Every compiled executor reports its compiler output before grading begins, so a `compile-message` with an
empty log is normal and should not be shown to the user.

`GET /judge/abort?judgeName=local&judgeKey=...&submissionId=1` returns `{"abort": true}` or
`{"abort": false}`.

`POST /judge/disconnect` takes `{"judgeName": "...", "judgeKey": "..."}` and returns `{"ok": true}`.

## Tiers

The base image comes from DMOJ and decides which languages exist:

- `tier1`: C, C++ through C++20, Java 8, Python 2 and 3, Pascal, assembly, sed, plain text. Around 1.2 GB
  built. This is the default, and it covers what a contest problem set normally needs.
- `tier2`: tier1 plus the mid-popularity runtimes.
- `tier3`: everything DMOJ supports, and considerably larger.

Pick one at build time with `--build-arg TIER=`. Judges are also assigned a tier in the staff console, which
is a different thing: it controls which judges the site prefers when handing out submissions, so a slow
machine can be kept as an overflow judge.

## Building and running

Build from the repository root, so the subtree is in the build context:

```
docker build --build-arg TIER=tier1 -t moj-judge:tier1 apps/judge
```

Create the judge in the staff console first, under Admin, Judges. Give it a name and a key; the site stores
only `sha256(key)`, so the key is shown once. The name and key you enter there are what the container needs.

Run it on the same machine as the site:

```
docker run --rm \
  --cap-add SYS_PTRACE \
  -v /srv/moj/problems:/problems \
  -e MOJ_URL=https://convex-site.judge.example.org \
  -e JUDGE_NAME=judge1 \
  -e JUDGE_KEY=... \
  moj-judge:tier1
```

On first start the container writes `/problems/judge.yml` from the template, containing the name, the key
and `problem_storage_globs: [/problems/**/]`. Edit that file to change a running judge's configuration; it
is not overwritten once it exists. Set `JUDGE_CONFIG` to keep it somewhere other than the problems volume.

### Running a judge on a second machine

Nothing about the judge needs to be near the site. It makes outbound HTTPS requests and nothing listens.

1. Install Docker on the machine and make sure it can reach the site over HTTPS.
2. Get the problem data onto it. The judge needs the same `/problems` tree the site's problem repos produce;
   an rsync from the primary judge or a checkout of the problems repository both work. It only ever reads
   the tree.
3. Create a second judge in the staff console with its own name and key.
4. Run the container:

```
docker run -d --restart unless-stopped --name moj-judge \
  --cap-add SYS_PTRACE \
  -v /srv/moj/problems:/problems \
  -e MOJ_URL=https://convex-site.judge.example.org \
  -e JUDGE_NAME=judge2 \
  -e JUDGE_KEY=... \
  moj-judge:tier1
```

5. Check Admin, Judges. The judge appears online with its problem count and load once the handshake lands,
   which takes as long as the executor self-tests do, usually under a minute.

Useful extras: `--cpuset-cpus` to keep the sandbox off cores you need for something else, and `-e
JUDGE_CONFIG=/etc/moj/judge.yml` with a matching mount if you would rather not have the config in the
problems tree.

If the judge reports fewer problems than you expect, the usual cause is a directory without an `init.yml` or
a dotted code whose nesting does not match. If it reports fewer executors than you expect, read the startup
log: each skipped executor says whether the command was missing or the self-test failed.

For local development, `infra/compose.dev.yml` runs the judge against a Convex backend on the host through
`host.docker.internal`. On a machine whose firewall does not trust the docker bridge this will not connect;
either allow the bridge to reach the backend's port (on NixOS, add `docker0` to
`networking.firewall.trustedInterfaces`) or run the container with `--network host`.

## Tests

`tests/mock_server.py` implements the judge API over `http.server`, backed by an in-memory queue and an event
log. It can be run standalone (`python3 apps/judge/tests/mock_server.py --port 3211`) to poke at a judge by
hand.

`tests/e2e.py` starts that mock, runs the real image against it, and feeds it four submissions for `aplusb`:
one that is accepted, one that is wrong, one that times out, and one that is aborted from the site part way
through. It asserts the exact event sequence and per-case verdicts for each, that test case events only ever
arrive inside a batch, that case positions are sequential, and that an aborted submission reports
`submission-terminated` and never `grading-end`.

```
python3 apps/judge/tests/e2e.py            # against an already built moj-judge:tier1
python3 apps/judge/tests/e2e.py --build    # build first
python3 apps/judge/tests/e2e.py --port 3311 --network host
```

It prefers `host.docker.internal` and falls back to host networking when the container cannot reach the
host, which is what happens on a box whose firewall does not trust the docker bridge.

## Updating from upstream

The subtree tracks `git@github.com:MonashAPS/judge-server.git` branch `v2`.

```
git subtree pull --prefix apps/judge/judge-server git@github.com:MonashAPS/judge-server.git v2 --squash
```

The diff inside the subtree is three files, so conflicts are rare and confined: `dmoj/moj_packet.py` is
entirely ours, and `dmoj/judge.py` and `dmoj/judgeenv.py` each carry a few lines. Rebuild the image and run
`tests/e2e.py` after every pull.

To send changes back to the fork:

```
git subtree push --prefix apps/judge/judge-server git@github.com:MonashAPS/judge-server.git some-branch
```

`UPSTREAM.md` lists the upstream pull requests already carried here. When one of them merges upstream, drop
its row and let the next subtree pull bring it in.
