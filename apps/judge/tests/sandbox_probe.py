"""
Runs a submission through a judge executor and reports what the sandbox did.

Meant to be run inside the judge image, as the judge user:

    runuser -u judge -w PATH,HOME -- /env/bin/python3 apps/judge/tests/sandbox_probe.py SKCPP

It compiles each program in `splashkit_programs.HOSTILE`, runs it under the real
sandbox, and prints the exit status, the signal, and anything the program managed
to say. A program that prints ESCAPED got past the sandbox.
"""

import os
import sys

EXECUTOR_NAME = sys.argv[1] if len(sys.argv) > 1 else 'SKCPP'
# judgeenv reads the process arguments, so the real ones are taken first.
sys.argv = ['sandbox_probe', '-c', os.environ.get('JUDGE_RUNTIME_PATHS', '/judge-runtime-paths.yml')]

from dmoj import judgeenv  # noqa: E402

judgeenv.load_env(cli=True)

from dmoj import executors  # noqa: E402
from dmoj.error import CompileError  # noqa: E402

executors.load_executors()

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from splashkit_programs import (  # noqa: E402
    APLUSB,
    FORK_BOMB,
    HOSTILE,
    INFINITE_LOOP,
    PY_APLUSB,
    PY_HOSTILE,
)

TIME_LIMIT = 10.0
MEMORY_LIMIT = 262144


def run(executor_name: str, label: str, source: str, stdin: bytes = b'') -> None:
    executor_class = executors.executors[executor_name].Executor
    try:
        executor = executor_class('probe', source.encode())
    except CompileError as error:
        message = error.args[0]
        if isinstance(message, bytes):
            message = message.decode('utf-8', 'replace')
        print('%-26s COMPILE ERROR\n%s' % (label, message[:400]))
        return

    process = executor.launch(
        time=TIME_LIMIT, memory=MEMORY_LIMIT, symlinks={}, stdin=-1, stdout=-1, stderr=-1
    )
    stdout, stderr = process.communicate(stdin)
    text = stdout.decode('utf-8', 'replace').strip()
    err = stderr.decode('utf-8', 'replace').strip()

    verdict = []
    if process.is_ir:
        verdict.append('IR')
    if process.is_rte:
        verdict.append('RTE')
    if process.is_tle:
        verdict.append('TLE')
    if process.is_mle:
        verdict.append('MLE')
    escaped = 'ESCAPED' in text or 'ESCAPED' in err

    print(
        '%-26s %-14s rc=%-4s sig=%-3s %s'
        % (
            label,
            ','.join(verdict) or 'ran',
            process.returncode,
            process.signal,
            '*** ESCAPED ***' if escaped else (text.splitlines()[0][:60] if text else '(no output)'),
        )
    )
    if err:
        for line in err.splitlines()[-6:]:
            print('%-26s   %s' % ('', line[:110]))


def main() -> int:
    executor_name = EXECUTOR_NAME
    python = 'PY' in executor_name
    control = PY_APLUSB if python else APLUSB
    hostile = PY_HOSTILE if python else HOSTILE

    print('=== control: a legitimate program ===')
    run(executor_name, 'terminal io', control, b'1 2\n')

    print('\n=== hostile ===')
    for label, source in hostile:
        run(executor_name, label, source)

    if not python:
        print('\n=== limits ===')
        run(executor_name, 'fork bomb', FORK_BOMB)
        run(executor_name, 'infinite loop', INFINITE_LOOP)
    return 0


if __name__ == '__main__':
    sys.exit(main())
