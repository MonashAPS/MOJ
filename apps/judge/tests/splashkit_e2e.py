"""
End-to-end test for SplashKit on the MOJ judge.

Runs the SplashKit judge image against the mock site and feeds it submissions, so
everything the site-facing path does is exercised: the handshake reports the
executor, a console program written against SplashKit grades like any other, and
the hostile programs in `splashkit_programs` are refused.

The hostile programs each print ESCAPED when the thing they tried worked and
BLOCKED when it did not, and they are graded against a problem whose expected
output is BLOCKED. So the verdicts read directly:

  AC   the operation was refused and the program said so
  RTE  the sandbox killed it outright
  WA   it escaped, and the run fails

Run from the repository root, after building the image:

    DOCKER_BUILDKIT=0 docker build --cpuset-cpus=0-11,14-31 \\
        -f apps/judge/Dockerfile.splashkit --build-arg TIER=tier1 \\
        -t moj-judge:splashkit apps/judge
    python3 apps/judge/tests/splashkit_e2e.py
"""

import argparse
import os
import sys
from typing import List, Tuple

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from e2e import (  # noqa: E402
    JudgeContainer,
    check,
    collect,
    free_port,
    host_is_reachable,
    network_args,
    wait_for_final,
)
from e2e import JUDGE_KEY, JUDGE_NAME, site_archive  # noqa: E402
from mock_server import MockJudgeServer  # noqa: E402
from splashkit_programs import (  # noqa: E402
    APLUSB,
    FORK_BOMB,
    HOSTILE,
    INFINITE_LOOP,
    PY_APLUSB,
    PY_HOSTILE,
)

LANGUAGES = ['SKCPP', 'SKPY3']
APLUSB_PROBLEM = 'aplusb'
GUARD_PROBLEM = 'sandbox-guard'

# One case: whatever the program prints is compared against BLOCKED.
GUARD_CASES = [('', 'BLOCKED')]

FINALS = ('grading-end', 'internal-error', 'compile-error')
# A program the sandbox kills never reaches a verdict for its case, so both the
# graded refusal and the outright kill are accepted here.
HELD = ('AC', 'RTE', 'IR', 'TLE')


def verdict(server: MockJudgeServer, submission_id: int) -> Tuple[str, List[str]]:
    """The submission's own result: the first case that is not accepted, since a
    batch short-circuits after one failure and the trailing codes say only that."""
    types, cases = collect(server, submission_id)
    codes = [code for _number, code in cases]
    if 'internal-error' in types:
        return 'IE', codes
    if 'compile-error' in types:
        return 'CE', codes
    for code in codes:
        if code not in ('AC', 'SC'):
            return code, codes
    return ('AC' if codes else 'none'), codes


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--image', default='moj-judge:splashkit')
    parser.add_argument('--network', default='')
    args = parser.parse_args()

    port = free_port()
    server = MockJudgeServer(port=port, judge_name=JUDGE_NAME, judge_key=JUDGE_KEY)
    server.start()
    guard_hash = server.set_problem_data(GUARD_PROBLEM, site_archive(GUARD_CASES))

    failures: List[str] = []
    try:
        network = args.network or ('host' if sys.platform.startswith('linux') else 'bridge')
        check(host_is_reachable(args.image, network, port), 'containers cannot reach the mock on port %d' % port)

        container = JudgeContainer(args.image, port, network, name='moj-judge-splashkit-e2e')
        container.start()

        print('waiting for handshake...', flush=True)
        check(server.wait_until(lambda s: bool(s.handshakes), 180.0), 'judge never completed a handshake')
        executors = server.handshakes[0]['executors']
        for language in LANGUAGES:
            check(language in executors, 'judge did not report %s: %s' % (language, sorted(executors)))
        print('handshake reports %s' % ', '.join(LANGUAGES), flush=True)

        submission = 0
        for language in LANGUAGES:
            solution = PY_APLUSB if language == 'SKPY3' else APLUSB
            hostile = list(PY_HOSTILE) if language == 'SKPY3' else list(HOSTILE) + [
                ('fork bomb', FORK_BOMB),
                ('infinite loop', INFINITE_LOOP),
            ]

            print('\n=== %s: a console program ===' % language, flush=True)
            submission += 1
            server.enqueue(submission, APLUSB_PROBLEM, language, solution)
            wait_for_final(server, submission, FINALS)
            code, detail = verdict(server, submission)
            check(code == 'AC', '%s: the solution did not pass: %s %s' % (language, code, detail))
            print('accepted', flush=True)

            print('\n=== %s: the sandbox ===' % language, flush=True)
            for label, source in hostile:
                submission += 1
                server.enqueue(
                    submission, GUARD_PROBLEM, language, source, time_limit=10.0, problem_data_hash=guard_hash
                )
                wait_for_final(server, submission, FINALS)
                code, detail = verdict(server, submission)
                held = code in HELD
                print('%-26s %-4s %s' % (label, code, 'held' if held else 'ESCAPED'), flush=True)
                if not held:
                    failures.append('%s %s: %s %s' % (language, label, code, detail))

        if failures:
            print('\nthe sandbox did not hold:', flush=True)
            for failure in failures:
                print('  ' + failure, flush=True)
            return 1

        print('\nevery hostile submission was refused', flush=True)
        return 0
    finally:
        try:
            container.stop()
        except NameError:
            pass
        server.stop()


if __name__ == '__main__':
    sys.exit(main())
