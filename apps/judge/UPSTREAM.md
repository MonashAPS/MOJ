# Upstream state of the judge subtree

`apps/judge/judge-server/` is a git subtree of `git@github.com:MonashAPS/judge-server.git`, branch `v2`.
That branch is DMOJ's `master` (as of `5ef74c5d`, "ci: Print runner diagnostic information; #1257") plus a
small set of MAPS changes, and then a small set of open upstream pull requests that we found worth carrying
early. This file records what is in the subtree beyond plain upstream `master` and why.

## MAPS changes already on the fork

These arrived with the `v2` branch; they are not ours to review, but they are worth knowing about because
they change behaviour our problem repos depend on.

- Dotted problem codes map to nested directories. `get_problem_root` in `dmoj/judgeenv.py` splits the problem
  id on `.` and joins the parts, so the code `comp2823.a1.knapsack` lives at
  `/problems/comp2823/a1/knapsack/`. Upstream only ever looks for a directory named exactly like the code.
- The compiler time limit is 60 seconds rather than 10. Some problems ship checkers built on
  testlib, which take well over ten seconds to compile on a cold cache.
- `BaseExecutor.initialize` prints why an executor was skipped (no command found, or the command is not a
  file), which makes a half-populated runtime image much easier to debug.
- `.docker/tier3/Dockerfile` builds from `ghcr.io/dmoj/runtimes-tier3` and creates the virtualenv with
  `virtualenv` instead of `venv`, because the runtime image's Python has pip but no ensurepip.

## Our changes

- `dmoj/moj_packet.py` (new): the pull-protocol packet manager. See `apps/judge/README.md`.
- `dmoj/judge.py`: a `MojJudge` subclass and the four lines in `main()` that pick it when `MOJ_URL` is set.
- `dmoj/judgeenv.py`: the bridge host positional is not registered in `MOJ_URL` mode.

Nothing else in the subtree is modified, so `git subtree pull` stays cheap and these three files are the only
possible conflict sites.

## Upstream pull requests taken

Each is a separate commit whose body names the PR. They were taken because they apply to `v2` without
conflict, are self-contained, and either fix something we would hit or improve something we care about.

| PR | Title | Why |
| --- | --- | --- |
| [#1260](https://github.com/DMOJ/judge-server/pull/1260) | Update syscall lists | Security relevant and approved upstream. Adds `fchroot` (472) to the Linux tables and `pdptrace` (605) to FreeBSD's, so the seccomp policy names them instead of letting them through as unknown numbers on newer kernels. Pure data. |
| [#1261](https://github.com/DMOJ/judge-server/pull/1261) | ci: Fix mypy type failure | One `type: ignore[misc]` on the pyyaml non-printable patch, which typeshed now declares `Final`. Keeps `mypy` clean so our own type checking of the subtree is meaningful. |
| [#1212](https://github.com/DMOJ/judge-server/pull/1212) | Logging grading points | Prints the points a case earned next to its time and memory. Partial scoring is otherwise invisible in judge logs, which matters when debugging a batch that scored unexpectedly. |
| [#1241](https://github.com/DMOJ/judge-server/pull/1241) | Fix language autodetection | Replaces the hardcoded C/C++ preference in `compile_with_auxiliary_files` with an `ext_priority` ordering over executors. Checkers, interactors, validators and generators can then be written in any supported language, `.cc` is recognised as C++, and multi-file compilation is gated on the executor declaring support rather than on the file extension. Additive: existing C and C++ helpers keep working. |

## Upstream pull requests skipped

| PR | Title | Why not |
| --- | --- | --- |
| [#1148](https://github.com/DMOJ/judge-server/pull/1148) | judge: implement instant aborts | Wanted, and directly relevant to our abort polling, but it does not apply to `v2`: `dmoj/executors/compiled_executor.py` and `dmoj/graders/base.py` have both moved since. The branch also still carries leftover debug `print()` calls in `compiled_executor.py` and `utils/helper_files.py`, and it drops the compiled-binary cache cleanup in the worker's teardown in favour of a tempdir it removes from the parent. Resolving all of that is a rewrite, not a cherry-pick. We use the existing `REQUEST_ABORT` path instead, which is fast enough: the abort poller kills the running process through the grader, the current case returns, and `GRADING_ABORTED` follows immediately. Worth revisiting if the PR lands upstream. |
| [#1198](https://github.com/DMOJ/judge-server/pull/1198) | Implement submission memfd output | Does not apply: `dmoj/graders/signature.py` has changed. It also reorders `Result.CODE_DISPLAY_ORDER` so OLE outranks TLE, which changes the verdict a case reports, and we want our verdicts to match the DMOJ instance we are importing from. |
| [#1027](https://github.com/DMOJ/judge-server/pull/1027) | judgeenv: properly specify a default in docker | Superseded. It renames a `problem_dirs` variable that no longer exists; current `judgeenv` already sets `problem_globs = ['/problems/**/']` in Docker mode, which is what the PR was reaching for. |
| [#903](https://github.com/DMOJ/judge-server/pull/903) | Initial implementation of landlock calls | Too large and too deep in the sandbox to carry out of tree. |
| [#627](https://github.com/DMOJ/judge-server/pull/627) | Sample cases in judge and protocol | Changes the problem format and the bridge protocol. We express sample cases as a zero-point batch instead, which needs nothing from the judge. |
| [#1075](https://github.com/DMOJ/judge-server/pull/1075) | Pretest dependencies | Changes the problem format. |
| [#1208](https://github.com/DMOJ/judge-server/pull/1208) | fix: bad seccomp detection | Not on the candidate list and unreviewed upstream; the tier images we run do not hit it. |

## Known lint failure

`flake8` on the subtree reports one pre-existing violation that came with the fork:

```
dmoj/judgeenv.py:240:73: Q000 Double quotes found but single quotes preferred
```

It is the MAPS dotted-problem-code change (`*problem_id.split(".")`). Left alone so our diff stays confined
to the three files listed above; fix it on the fork rather than here. `black` and `mypy` are both clean.

## Updating from upstream

```
git fetch git@github.com:MonashAPS/judge-server.git v2
git subtree pull --prefix apps/judge/judge-server git@github.com:MonashAPS/judge-server.git v2 --squash
```

Conflicts should only ever be in `dmoj/judge.py` and `dmoj/judgeenv.py`; `dmoj/moj_packet.py` is ours alone.
To send our changes back:

```
git subtree push --prefix apps/judge/judge-server git@github.com:MonashAPS/judge-server.git <branch>
```

When a PR in the tables above is merged upstream, drop its row from "taken" and let the subtree pull bring it
in normally; the duplicate change will merge cleanly because the content is identical.
