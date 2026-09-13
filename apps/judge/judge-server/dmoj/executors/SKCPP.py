from typing import Dict, List

from dmoj.executors.c_like_executor import CPPExecutor, GCCMixin

"""
C++ against SplashKit, the teaching library used in introductory units.

This is its own executor rather than a flag on the plain C++ ones because linking
SplashKit is not free: it pulls in SDL2 and libcurl, which every ordinary C++
submission would then load for nothing.

Only the terminal half of the library is gradable. `read_line` and `write_line`
are standard input and output, so a console program grades like any other. A
program that opens a window draws pixels, which no output comparison can check,
and the dummy drivers below mean it fails on its own rather than going looking
for a display.
"""


class Executor(GCCMixin, CPPExecutor):
    command = 'g++sk'
    command_paths = ['g++-16', 'g++-15', 'g++-14', 'g++-13', 'g++-12', 'g++-11', 'g++']
    std = 'c++17'
    ext_priority = 6

    def get_ldflags(self) -> List[str]:
        # The library and its headers land in /usr/local, which is already inside
        # the sandbox's readable tree, so no filesystem rule has to be widened.
        return super().get_ldflags() + ['-L/usr/local/lib', '-lSplashKit']

    def get_env(self) -> Dict[str, str]:
        env = super().get_env()
        # SDL probes for video and audio devices as the library loads, before any
        # of the submission's own code runs. The dummy drivers keep that probing
        # inside the process: without them a console-only program spends its time
        # failing to open devices the sandbox will not show it anyway.
        env['SDL_VIDEODRIVER'] = 'dummy'
        env['SDL_AUDIODRIVER'] = 'dummy'
        env['SDL_RENDER_DRIVER'] = 'software'
        return env

    test_program = """
#include "splashkit.h"

int main()
{
    write_line(read_line());
    return 0;
}
"""
