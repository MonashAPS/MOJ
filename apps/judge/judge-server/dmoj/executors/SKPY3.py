from typing import Dict

from dmoj.executors.PY3 import Executor as PY3Executor

"""
Python against SplashKit.

The binding is one module that loads the same shared library through ctypes, so
this needs no toolchain of its own. It still needs an executor: submissions run
with `-S`, which is what keeps the interpreter off site-packages, and a module
installed there is therefore invisible to the plain Python entry. Naming the
directory on the path puts it back for SplashKit submissions only, and leaves
ordinary Python submissions exactly as they were.
"""


class Executor(PY3Executor):
    command = 'python3sk'
    command_paths = ['python3']
    ext_priority = 2

    def get_env(self) -> Dict[str, str]:
        env = super().get_env()
        # Where the image puts splashkit.py. It is under /usr, which the sandbox
        # already allows reading, so no filesystem rule has to be widened.
        env['PYTHONPATH'] = '/usr/local/lib'
        # SDL probes for devices as the library loads. The dummy drivers keep that
        # inside the process rather than sending it looking for a display.
        env['SDL_VIDEODRIVER'] = 'dummy'
        env['SDL_AUDIODRIVER'] = 'dummy'
        env['SDL_RENDER_DRIVER'] = 'software'
        return env

    test_program = """
import splashkit

splashkit.write_line(splashkit.read_line())
"""
