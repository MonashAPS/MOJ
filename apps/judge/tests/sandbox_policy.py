"""
Asserts that the SplashKit executors are sandboxed exactly like the plain ones.

Linking a library as large as SplashKit is the kind of change that tempts someone
into opening a syscall or a directory to make it work, and a hole opened that way
would apply to every submission in the language, not just the ones using the
library. So the property is checked directly rather than inferred: the syscall
policy, the readable and writable paths, and the process and memory limits must
match the executor each one derives from, exactly.

Only the environment may differ, and only by the variables listed below, which
name a directory the sandbox already allows reading and tell SDL not to go
looking for a display.

Run inside the judge image, as the judge user:

    runuser -u judge -w PATH,HOME -- /env/bin/python3 apps/judge/tests/sandbox_policy.py
"""

import os
import sys

# judgeenv reads the process arguments, so they are replaced before it is imported.
sys.argv = ['sandbox_policy', '-c', os.environ.get('JUDGE_RUNTIME_PATHS', '/judge-runtime-paths.yml')]

from dmoj import judgeenv  # noqa: E402

judgeenv.load_env(cli=True)

from dmoj import executors  # noqa: E402

executors.load_executors()

PAIRS = [('CPP17', 'SKCPP'), ('PY3', 'SKPY3')]

SOURCES = {
    'CPP17': b'#include <cstdio>\nint main() { return 0; }\n',
    'SKCPP': b'#include "splashkit.h"\nint main() { return 0; }\n',
    'PY3': b'pass\n',
    'SKPY3': b'import splashkit\n',
}

ALLOWED_ENV = {'PYTHONPATH', 'SDL_VIDEODRIVER', 'SDL_AUDIODRIVER', 'SDL_RENDER_DRIVER'}


def describe(name: str) -> dict:
    executor = executors.executors[name].Executor('policy', SOURCES[name])
    security = executor.get_security()
    return {
        'syscalls': {
            number: type(handler).__name__ + str(getattr(handler, 'errno', ''))
            for number, handler in security.items()
        },
        # Every executor gets its own working directory, so that one rule differs
        # by construction and says nothing about the policy.
        'read_fs': sorted(str(rule) for rule in executor.get_fs() if '/tmp/tmp' not in str(rule)),
        'write_fs': sorted(str(rule) for rule in executor.get_write_fs()),
        'env': executor.get_env(),
        'nproc': executor.get_nproc(),
        'address_grace': executor.get_address_grace(),
    }


def main() -> int:
    failures = []
    for base_name, variant_name in PAIRS:
        base = describe(base_name)
        variant = describe(variant_name)
        print('%s vs %s' % (base_name, variant_name))

        for field in ('syscalls', 'read_fs', 'write_fs', 'nproc', 'address_grace'):
            if base[field] == variant[field]:
                print('  %-14s identical' % field)
                continue
            print('  %-14s DIFFERS' % field)
            failures.append('%s: %s differs from %s' % (variant_name, field, base_name))

        added = {key: value for key, value in variant['env'].items() if base['env'].get(key) != value}
        unexpected = set(added) - ALLOWED_ENV
        print('  %-14s %s' % ('env adds', ', '.join(sorted(added)) or 'nothing'))
        if unexpected:
            failures.append('%s: unexpected environment %s' % (variant_name, sorted(unexpected)))
        if set(base['env']) - set(variant['env']):
            failures.append('%s: drops environment the base sets' % variant_name)

    if failures:
        print('\nthe SplashKit executors are not sandboxed like the plain ones:')
        for failure in failures:
            print('  ' + failure)
        return 1

    print('\nboth SplashKit executors carry the same sandbox as the executor they derive from')
    return 0


if __name__ == '__main__':
    sys.exit(main())
