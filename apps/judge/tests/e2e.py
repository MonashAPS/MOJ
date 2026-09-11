"""
End-to-end test for the MOJ judge image.

Starts the mock judge API, runs the judge container against it, then feeds it submissions and asserts the
exact event stream each one produces.

Four of them grade the `aplusb` problem in infra/problems, which the container has on local disk:

  1. an accepted Python solution
  2. a wrong solution that fails the first case of the scored batch
  3. a solution that loops forever and times out
  4. a solution that loops forever and is aborted from the site

The rest grade a problem that exists nowhere on disk, to prove the judge can work from test data the site
owns and nothing else:

  5. a claim carrying a hash fetches the archive and grades it
  6. a second claim at the same hash grades from the cache without asking the site again
  7. a claim at a new hash fetches the new archive, and grades the case the new one added
  8. a claim whose archive does not match its hash is an internal error, not a verdict
  9. the copy the cache already held survives that failed fetch
 10. a claim with a null hash still grades from local disk

Run from the repository root:

    python3 apps/judge/tests/e2e.py

Pass --build to build the image first, or --image to point at a different tag.
"""

import argparse
import hashlib
import json
import os
import subprocess
import sys
import threading
import time
from typing import Dict, List, Optional, Tuple, Union

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from mock_server import MockJudgeServer, build_archive  # noqa: E402

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
# Optional CPU pinning for the image build; set MOJ_CPUSET to a taskset-style list on a machine that
# needs it. Unset, the build floats across every core.
CPUSET = os.environ.get('MOJ_CPUSET', '')
CPUSET_FLAGS = ['--cpuset-cpus', CPUSET] if CPUSET else []


def free_port() -> int:
    import socket

    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]

DEFAULT_IMAGE = 'moj-judge:tier1'
# The mock listens where a self-hosted Convex deployment serves its HTTP actions; override with --port when
# something else already has it (a local convex-backend, for instance).
DEFAULT_PORT = 3211
JUDGE_NAME = 'local'
JUDGE_KEY = 'local'
GRADE_TIMEOUT = 120.0

AC_SOURCE = 'a, b = map(int, input().split())\nprint(a + b)\n'
WA_SOURCE = 'a, b = map(int, input().split())\nprint(a + b + (1 if a + b > 1000 else 0))\n'
LOOP_SOURCE = 'while True:\n    pass\n'
MUL_SOURCE = 'a, b = map(int, input().split())\nprint(a * b)\n'

# Nothing under infra/problems provides this code, so every case below that grades it can only be grading
# test data the judge fetched. It multiplies rather than adds, so grading it against another problem's data
# would fail rather than quietly pass.
SITE_PROBLEM = 'sitemul'

# Bitmask decode order, from SPEC.md section 6.
STATUS_BITS: List[Tuple[int, str]] = [
    (4, 'TLE'),
    (8, 'MLE'),
    (64, 'OLE'),
    (2, 'RTE'),
    (16, 'IR'),
    (1, 'WA'),
    (32, 'SC'),
]


def decode_status(status: int) -> str:
    for bit, code in STATUS_BITS:
        if status & bit:
            return code
    return 'AC'


class Failure(Exception):
    pass


def site_archive(cases: List[Tuple[str, str]]) -> bytes:
    """An archive for a one-batch problem, a case per (input, expected output) pair."""
    files: Dict[str, Union[str, bytes]] = {}
    entries = []
    for position, (stdin, stdout) in enumerate(cases, start=1):
        files['tests/%d.in' % position] = stdin + '\n'
        files['tests/%d.out' % position] = stdout + '\n'
        entries.append('  - {in: tests/%d.in, out: tests/%d.out}' % (position, position))
    files['init.yml'] = 'test_cases:\n- batched:\n%s\n  points: 100\n' % '\n'.join(entries)
    return build_archive(files)


def internal_error_message(server: MockJudgeServer, submission_id: int) -> str:
    for record in server.events_for(submission_id):
        if record['type'] == 'internal-error':
            return str(record['event'].get('message', ''))
    return ''


def check(condition: bool, message: str) -> None:
    if not condition:
        raise Failure(message)


def network_args(network: str, port: int) -> Tuple[List[str], str]:
    """Docker flags and the URL the container should use to reach the mock on the host."""
    if network == 'host':
        return ['--network', 'host'], 'http://127.0.0.1:%d' % port
    return ['--add-host', 'host.docker.internal:host-gateway'], 'http://host.docker.internal:%d' % port


def host_is_reachable(image: str, network: str, port: int) -> bool:
    """Check that a container can open a connection back to the mock before spending minutes on a judge."""
    flags, url = network_args(network, port)
    host = url.split('//', 1)[1].rsplit(':', 1)[0]
    probe = 'import socket; socket.create_connection((%r, %d), 5).close()' % (host, port)
    result = subprocess.run(
        ['docker', 'run', '--rm', *CPUSET_FLAGS, '--entrypoint', '/env/bin/python3']
        + flags
        + [image, '-c', probe],
        capture_output=True,
        text=True,
    )
    return result.returncode == 0


class JudgeContainer:
    def __init__(self, image: str, port: int, network: str, name: str = 'moj-judge-e2e'):
        self.image = image
        self.port = port
        self.network = network
        self.name = name
        self.process: Optional[subprocess.Popen] = None
        self.log: List[str] = []
        self._reader: Optional[threading.Thread] = None

    def start(self) -> None:
        subprocess.run(['docker', 'rm', '-f', self.name], capture_output=True)
        flags, url = network_args(self.network, self.port)
        command = (
            [
                'docker',
                'run',
                '--rm',
                '--name',
                self.name,
                '--cap-add',
                'SYS_PTRACE',
                *CPUSET_FLAGS,
                '-e',
                'JUDGE_API_PORT=%d' % free_port(),
                '-v',
                '%s/infra/problems:/problems' % REPO_ROOT,
                '-e',
                'MOJ_URL=%s' % url,
                '-e',
                'JUDGE_NAME=%s' % JUDGE_NAME,
                '-e',
                'JUDGE_KEY=%s' % JUDGE_KEY,
            ]
            + flags
            + [
                self.image,
            ]
        )
        print('$ ' + ' '.join(command), flush=True)
        self.process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)

        def pump() -> None:
            assert self.process is not None and self.process.stdout is not None
            for line in self.process.stdout:
                self.log.append(line.rstrip('\n'))
                print('[judge] ' + line.rstrip('\n'), flush=True)

        self._reader = threading.Thread(target=pump, daemon=True)
        self._reader.start()

    def stop(self) -> None:
        subprocess.run(['docker', 'rm', '-f', self.name], capture_output=True)
        if self.process is not None:
            try:
                self.process.wait(timeout=30)
            except subprocess.TimeoutExpired:
                self.process.kill()


def collect(server: MockJudgeServer, submission_id: int) -> Tuple[List[str], List[Tuple[int, str]]]:
    """Return the event types in order (with test-case-status collapsed away) and the flattened cases.

    `compile-message` is dropped: every DMOJ CompiledExecutor reports its compiler output before grading,
    even when that output is empty, so whether it appears depends on the runtime rather than the submission.
    `check_compile_message_order` asserts the part of it that does matter.
    """
    types: List[str] = []
    cases: List[Tuple[int, str]] = []
    for record in server.events_for(submission_id):
        if record['type'] == 'test-case-status':
            for case in record['event']['cases']:
                cases.append((case['position'], decode_status(case['status'])))
        elif record['type'] != 'compile-message':
            types.append(record['type'])
    return types, cases


def check_compile_message_order(server: MockJudgeServer, submission_id: int) -> None:
    seen_grading_begin = False
    for record in server.events_for(submission_id):
        if record['type'] == 'grading-begin':
            seen_grading_begin = True
        elif record['type'] == 'compile-message':
            check(
                not seen_grading_begin,
                'submission %d: compile-message arrived after grading-begin' % submission_id,
            )
            check(
                isinstance(record['event'].get('log'), str),
                'submission %d: compile-message has no log string' % submission_id,
            )


def wait_for_final(server: MockJudgeServer, submission_id: int, finals: Tuple[str, ...]) -> None:
    ok = server.wait_until(lambda s: any(e['type'] in finals for e in s.events_for(submission_id)), GRADE_TIMEOUT)
    check(ok, 'submission %d did not reach one of %s within %.0fs' % (submission_id, finals, GRADE_TIMEOUT))
    # Let any trailing events land before asserting on the sequence.
    time.sleep(1.0)


def check_case_shape(submission_id: int, server: MockJudgeServer) -> None:
    """Every test-case-status must arrive inside a batch, and cases must be numbered 1..n in order."""
    depth = 0
    seen = 0
    for record in server.events_for(submission_id):
        if record['type'] == 'batch-begin':
            depth += 1
        elif record['type'] == 'batch-end':
            depth -= 1
            check(depth >= 0, 'submission %d: batch-end without batch-begin' % submission_id)
        elif record['type'] == 'test-case-status':
            check(depth == 1, 'submission %d: test-case-status outside a batch' % submission_id)
            for case in record['event']['cases']:
                seen += 1
                check(
                    case['position'] == seen,
                    'submission %d: case positions are not sequential (%d after %d)'
                    % (submission_id, case['position'], seen - 1),
                )
                for key in ('status', 'time', 'memory', 'points', 'totalPoints', 'output'):
                    check(key in case, 'submission %d: case is missing %r' % (submission_id, key))
    check(depth == 0, 'submission %d: unbalanced batches' % submission_id)


def expect(
    server: MockJudgeServer, submission_id: int, label: str, types: List[str], cases: List[Tuple[int, str]]
) -> None:
    got_types, got_cases = collect(server, submission_id)
    check(got_types == types, '%s: expected events %s, got %s' % (label, types, got_types))
    check(got_cases == cases, '%s: expected cases %s, got %s' % (label, cases, got_cases))
    check_case_shape(submission_id, server)
    check_compile_message_order(server, submission_id)
    print('  %s: %s / %s' % (label, got_types, got_cases), flush=True)


BATCHED = ['grading-begin', 'batch-begin', 'batch-end', 'batch-begin', 'batch-end', 'grading-end']
ONE_BATCH = ['grading-begin', 'batch-begin', 'batch-end', 'grading-end']
FINALS = ('grading-end', 'internal-error', 'compile-error')


def run(image: str, port: int, network: str, dump: Optional[str] = None) -> None:
    server = MockJudgeServer(port=port, judge_name=JUDGE_NAME, judge_key=JUDGE_KEY)
    server.start()
    judge_yml = os.path.join(REPO_ROOT, 'infra', 'problems', 'judge.yml')
    container: Optional[JudgeContainer] = None

    try:
        if network == 'bridge' and not host_is_reachable(image, 'bridge', port):
            print(
                'containers cannot reach host.docker.internal:%d, falling back to host networking.\n'
                'On a host with a firewall, allow the docker bridge to reach that port (on NixOS, add\n'
                '"docker0" to networking.firewall.trustedInterfaces) to use the bridge path.' % port,
                flush=True,
            )
            network = 'host'
        check(host_is_reachable(image, network, port), 'containers cannot reach the mock on port %d' % port)
        print('network: %s' % network, flush=True)

        container = JudgeContainer(image, port, network)
        container.start()

        print('waiting for handshake...', flush=True)
        check(server.wait_until(lambda s: bool(s.handshakes), 180.0), 'judge never completed a handshake')
        handshake = server.handshakes[0]
        problems = {code for code, _mtime in handshake['problems']}
        print(
            'handshake: %d problem(s), %d executor(s)' % (len(handshake['problems']), len(handshake['executors'])),
            flush=True,
        )
        check('aplusb' in problems, 'judge did not report the aplusb problem: %s' % sorted(problems))
        check('PY3' in handshake['executors'], 'judge did not report a PY3 executor')

        print('\n=== 1. accepted ===', flush=True)
        server.enqueue(1, 'aplusb', 'PY3', AC_SOURCE)
        wait_for_final(server, 1, ('grading-end', 'internal-error', 'compile-error'))
        expect(server, 1, 'AC', BATCHED, [(1, 'AC'), (2, 'AC'), (3, 'AC'), (4, 'AC'), (5, 'AC'), (6, 'AC')])

        print('\n=== 2. wrong answer ===', flush=True)
        server.enqueue(2, 'aplusb', 'PY3', WA_SOURCE)
        wait_for_final(server, 2, ('grading-end', 'internal-error', 'compile-error'))
        expect(server, 2, 'WA', BATCHED, [(1, 'AC'), (2, 'AC'), (3, 'WA'), (4, 'SC'), (5, 'SC'), (6, 'SC')])

        print('\n=== 3. time limit exceeded ===', flush=True)
        server.enqueue(3, 'aplusb', 'PY3', LOOP_SOURCE)
        wait_for_final(server, 3, ('grading-end', 'internal-error', 'compile-error'))
        expect(server, 3, 'TLE', BATCHED, [(1, 'TLE'), (2, 'SC'), (3, 'SC'), (4, 'SC'), (5, 'SC'), (6, 'SC')])

        print('\n=== 4. terminated ===', flush=True)
        # A generous time limit so the submission is still running when the abort poll comes round.
        server.set_abort(4, True)
        server.enqueue(4, 'aplusb', 'PY3', LOOP_SOURCE, time_limit=20.0)
        wait_for_final(server, 4, ('submission-terminated', 'grading-end', 'internal-error'))
        types, _cases = collect(server, 4)
        check(
            types[-1] == 'submission-terminated',
            'terminate: expected the last event to be submission-terminated, got %s' % types,
        )
        check('grading-end' not in types, 'terminate: an aborted submission must not report grading-end')
        print('  terminate: %s' % types, flush=True)

        print('\n=== 5. test data fetched from the site ===', flush=True)
        first = site_archive([('2 3', '6'), ('7 8', '56')])
        first_hash = server.set_problem_data(SITE_PROBLEM, first)
        server.enqueue(5, SITE_PROBLEM, 'PY3', MUL_SOURCE, problem_data_hash=first_hash)
        wait_for_final(server, 5, FINALS)
        expect(server, 5, 'fetched', ONE_BATCH, [(1, 'AC'), (2, 'AC')])
        check(
            server.data_requests_for(SITE_PROBLEM) == 1,
            'expected one data request for %s, saw %d' % (SITE_PROBLEM, server.data_requests_for(SITE_PROBLEM)),
        )

        print('\n=== 6. cached, not downloaded again ===', flush=True)
        server.enqueue(6, SITE_PROBLEM, 'PY3', MUL_SOURCE, problem_data_hash=first_hash)
        wait_for_final(server, 6, FINALS)
        expect(server, 6, 'cached', ONE_BATCH, [(1, 'AC'), (2, 'AC')])
        check(
            server.data_requests_for(SITE_PROBLEM) == 1,
            'a second submission at the same hash downloaded the data again (%d requests)'
            % server.data_requests_for(SITE_PROBLEM),
        )

        print('\n=== 7. a new hash is fetched again ===', flush=True)
        second = site_archive([('2 3', '6'), ('7 8', '56'), ('10 11', '110')])
        second_hash = server.set_problem_data(SITE_PROBLEM, second)
        check(second_hash != first_hash, 'the two archives hash the same, so the test proves nothing')
        server.enqueue(7, SITE_PROBLEM, 'PY3', MUL_SOURCE, problem_data_hash=second_hash)
        wait_for_final(server, 7, FINALS)
        # The third case only exists in the new archive: seeing it graded is what proves the refetch landed.
        expect(server, 7, 'refetched', ONE_BATCH, [(1, 'AC'), (2, 'AC'), (3, 'AC')])
        check(
            server.data_requests_for(SITE_PROBLEM) == 2,
            'expected a second data request after the hash changed, saw %d'
            % server.data_requests_for(SITE_PROBLEM),
        )

        print('\n=== 8. a corrupted archive is an internal error ===', flush=True)
        third = site_archive([('2 3', '6'), ('7 8', '56'), ('10 11', '110'), ('12 12', '144')])
        third_hash = hashlib.sha256(third).hexdigest()
        # The site promises the four-case archive and serves the two-case one instead.
        server.set_problem_data(SITE_PROBLEM, first, advertised_hash=third_hash)
        server.enqueue(8, SITE_PROBLEM, 'PY3', MUL_SOURCE, problem_data_hash=third_hash)
        wait_for_final(server, 8, ('internal-error', 'grading-end', 'compile-error'))
        types, cases = collect(server, 8)
        check(types == ['internal-error'], 'corrupt: expected only an internal error, got %s' % types)
        check(not cases, 'corrupt: a submission with unusable data must not report any case')
        message = internal_error_message(server, 8)
        check(SITE_PROBLEM in message, 'corrupt: the internal error does not name the problem: %r' % message)
        check(third_hash in message, 'corrupt: the internal error does not name the hash: %r' % message)
        print('  corrupt: %s' % message.strip().splitlines()[-1][:160], flush=True)

        print('\n=== 9. the failed fetch left the cache alone ===', flush=True)
        server.set_problem_data(SITE_PROBLEM, second)
        server.enqueue(9, SITE_PROBLEM, 'PY3', MUL_SOURCE, problem_data_hash=second_hash)
        wait_for_final(server, 9, FINALS)
        expect(server, 9, 'survived', ONE_BATCH, [(1, 'AC'), (2, 'AC'), (3, 'AC')])
        check(
            server.data_requests_for(SITE_PROBLEM) == 3,
            'the good copy was not still cached after the corrupt fetch (%d requests)'
            % server.data_requests_for(SITE_PROBLEM),
        )

        print('\n=== 10. a null hash grades from local disk ===', flush=True)
        server.enqueue(10, 'aplusb', 'PY3', AC_SOURCE, problem_data_hash=None)
        wait_for_final(server, 10, FINALS)
        expect(server, 10, 'local', BATCHED, [(1, 'AC'), (2, 'AC'), (3, 'AC'), (4, 'AC'), (5, 'AC'), (6, 'AC')])
        check(
            server.data_requests_for('aplusb') == 0,
            'a claim with no hash asked the site for test data anyway',
        )

        print('\n=== heartbeats ===', flush=True)
        # Grading four submissions takes under ten seconds, so wait for the cadence rather than assume it.
        # The site's recovery cron requeues work from judges that stop heartbeating, so this matters.
        check(
            server.wait_until(lambda s: len(s.heartbeats) >= 3, 45.0),
            'judge sent %d heartbeat(s) in 45s, expected one every 10s' % len(server.heartbeats),
        )
        beats = list(server.heartbeats)
        loads = [h['load'] for h in beats]
        check(all(isinstance(load, (int, float)) for load in loads), 'heartbeat load is not numeric: %s' % loads)
        gaps = [b['at'] - a['at'] for a, b in zip(beats, beats[1:])]
        worst = max(gaps)
        check(5.0 < worst < 20.0, 'heartbeat gaps are not about 10s: %s' % ['%.1f' % g for g in gaps])
        print(
            '  %d heartbeat(s) over %.0fs, longest gap %.1fs, last load %.2f'
            % (len(beats), beats[-1]['at'] - beats[0]['at'], worst, loads[-1]),
            flush=True,
        )

        print('\nAll checks passed.', flush=True)
    finally:
        if dump is not None:
            with open(dump, 'w') as f:
                json.dump(
                    {
                        'handshakes': server.handshakes,
                        'heartbeats': server.heartbeats,
                        'events': server.events,
                        'claimed': list(server.claimed.values()),
                        'dataRequests': server.data_requests,
                    },
                    f,
                    indent=2,
                )
            print('wrote %s' % dump, flush=True)
        if container is not None:
            container.stop()
        server.stop()
        if os.path.exists(judge_yml):
            try:
                os.remove(judge_yml)
            except OSError as e:
                print('could not remove %s: %s' % (judge_yml, e), flush=True)


def main() -> int:
    parser = argparse.ArgumentParser(description='End-to-end test for the MOJ judge image.')
    parser.add_argument('--image', default=DEFAULT_IMAGE)
    parser.add_argument('--port', type=int, default=DEFAULT_PORT, help='port for the mock judge API')
    parser.add_argument('--dump', help='write every request the mock received to this file as JSON')
    parser.add_argument(
        '--network',
        choices=('bridge', 'host'),
        default='bridge',
        help='bridge reaches the mock through host.docker.internal, host through 127.0.0.1',
    )
    parser.add_argument('--tier', default='tier1')
    parser.add_argument('--build', action='store_true', help='build the image before running')
    args = parser.parse_args()

    if args.build:
        command = (['taskset', '-c', CPUSET] if CPUSET else []) + [
            'docker',
            'build',
            '--build-arg',
            'TIER=%s' % args.tier,
            '-t',
            args.image,
            os.path.join(REPO_ROOT, 'apps', 'judge'),
        ]
        print('$ ' + ' '.join(command), flush=True)
        subprocess.run(command, check=True)

    try:
        run(args.image, args.port, args.network, args.dump)
    except Failure as e:
        print('\nFAILED: %s' % e, file=sys.stderr, flush=True)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
