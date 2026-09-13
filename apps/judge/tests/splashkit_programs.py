"""
SplashKit submissions for the judge tests, the honest one and the hostile ones.

Every hostile program is written so that a successful escape is *visible in the
output*: it prints ESCAPED when the thing it tried to do worked, and BLOCKED when
the kernel or the sandbox refused it. The problem they are graded against expects
BLOCKED, so the verdicts read directly:

  AC   the program ran and the operation was refused, which is the point
  RTE  the sandbox killed it for a disallowed syscall, equally the point
  WA   it printed ESCAPED, and the sandbox has a hole

Anything other than AC or RTE on these is a failure of the test suite, not a
quirk to be explained away.
"""

# The legitimate case: terminal input and output through SplashKit, nothing else.
# SplashKit's read_line and write_line are stdin and stdout, so this grades like
# any other submission.
APLUSB = """
#include "splashkit.h"
#include <sstream>
#include <string>

int main()
{
    std::istringstream line(read_line());
    int a, b;
    line >> a >> b;
    write_line(std::to_string(a + b));
    return 0;
}
"""

# SplashKit links libcurl and SDL2_net and exposes HTTP to the program, so the
# first thing to establish is that a submission still cannot reach the network.
HTTP_GET = """
#include "splashkit.h"

int main()
{
    http_response response = http_get("http://127.0.0.1/", 80);
    if (response != nullptr)
    {
        write_line("ESCAPED: http_get returned a response");
        return 0;
    }
    write_line("BLOCKED");
    return 0;
}
"""

# The same thing one layer down, in case SplashKit's own wrapper is what failed
# rather than the sandbox.
RAW_SOCKET = """
#include "splashkit.h"
#include <sys/socket.h>

int main()
{
    int fd = socket(AF_INET, SOCK_STREAM, 0);
    if (fd >= 0)
    {
        write_line("ESCAPED: opened socket");
        return 0;
    }
    write_line("BLOCKED");
    return 0;
}
"""

READ_SHADOW = """
#include "splashkit.h"
#include <cstdio>

int main()
{
    FILE *f = fopen("/etc/shadow", "r");
    if (f != nullptr)
    {
        write_line("ESCAPED: read /etc/shadow");
        fclose(f);
        return 0;
    }
    write_line("BLOCKED");
    return 0;
}
"""

# The judge's own working directories: the problem test data it holds on disk and
# the cache of archives the site sent it. A submission reading either would be
# reading the answers.
READ_JUDGE_DATA = """
#include "splashkit.h"
#include <cstdio>
#include <string>

int main()
{
    const char *paths[] = {
        "/problems/aplusb/init.yml",
        "/judge-data-cache",
        "/judge/dmoj/judge.py",
        "/judge.yml",
    };
    for (const char *path : paths)
    {
        FILE *f = fopen(path, "r");
        if (f != nullptr)
        {
            write_line(std::string("ESCAPED: read ") + path);
            fclose(f);
            return 0;
        }
    }
    write_line("BLOCKED");
    return 0;
}
"""

WRITE_OUTSIDE = """
#include "splashkit.h"
#include <cstdio>
#include <string>

int main()
{
    const char *paths[] = {"/tmp/pwned", "/judge/pwned", "/problems/pwned", "/usr/local/lib/pwned"};
    for (const char *path : paths)
    {
        FILE *f = fopen(path, "w");
        if (f != nullptr)
        {
            write_line(std::string("ESCAPED: wrote ") + path);
            fclose(f);
            return 0;
        }
    }
    write_line("BLOCKED");
    return 0;
}
"""

EXEC_SHELL = """
#include "splashkit.h"
#include <unistd.h>

int main()
{
    execl("/bin/sh", "sh", "-c", "echo ESCAPED: got a shell", nullptr);
    write_line("BLOCKED");
    return 0;
}
"""

PTRACE_INIT = """
#include "splashkit.h"
#include <sys/ptrace.h>

int main()
{
    if (ptrace(PTRACE_ATTACH, 1, nullptr, nullptr) == 0)
    {
        write_line("ESCAPED: attached to pid 1");
        return 0;
    }
    write_line("BLOCKED");
    return 0;
}
"""

# The judge authenticates to the site with a key. A submission must not be able to
# reach it, through its own environment or through another process.
STEAL_JUDGE_KEY = """
#include "splashkit.h"
#include <cstdio>
#include <cstdlib>
#include <string>

int main()
{
    if (getenv("JUDGE_KEY") != nullptr || getenv("JUDGE_NAME") != nullptr)
    {
        write_line("ESCAPED: judge credentials in the environment");
        return 0;
    }
    const char *paths[] = {"/proc/1/environ", "/proc/self/environ", "/proc/1/cmdline"};
    for (const char *path : paths)
    {
        FILE *f = fopen(path, "r");
        if (f != nullptr)
        {
            write_line(std::string("ESCAPED: read ") + path);
            fclose(f);
            return 0;
        }
    }
    write_line("BLOCKED");
    return 0;
}
"""

# Graphics cannot be graded, but it must fail safely rather than reach a display
# or wander outside the sandbox looking for one.
OPEN_WINDOW = """
#include "splashkit.h"

int main()
{
    open_window("escape", 200, 200);
    write_line("BLOCKED");
    return 0;
}
"""

# Not an escape, but the other half of "no holes": the limits still bind a program
# that carries a heavier runtime than a plain C++ one.
FORK_BOMB = """
#include "splashkit.h"
#include <string>
#include <unistd.h>

int main()
{
    int children = 0;
    for (int i = 0; i < 200; i++)
    {
        pid_t pid = fork();
        if (pid == 0)
        {
            while (true) {}
        }
        if (pid > 0)
        {
            children++;
        }
    }
    if (children > 0)
    {
        write_line("ESCAPED: forked " + std::to_string(children) + " children");
        return 0;
    }
    write_line("BLOCKED");
    return 0;
}
"""

INFINITE_LOOP = """
#include "splashkit.h"

int main()
{
    while (true) {}
    return 0;
}
"""

# Each hostile program, with the verdicts that mean the sandbox held.
HOSTILE = [
    ('http_get', HTTP_GET),
    ('raw socket', RAW_SOCKET),
    ('read /etc/shadow', READ_SHADOW),
    ('read judge data', READ_JUDGE_DATA),
    ('write outside the box', WRITE_OUTSIDE),
    ('exec a shell', EXEC_SHELL),
    ('ptrace pid 1', PTRACE_INIT),
    ('steal the judge key', STEAL_JUDGE_KEY),
    ('open a window', OPEN_WINDOW),
]


# The Python binding is the same library through ctypes, and it runs in the
# existing Python entry rather than one of its own, so the sandbox has to hold
# there too.
PY_APLUSB = """
import splashkit

a, b = map(int, splashkit.read_line().split())
splashkit.write_line(str(a + b))
"""

PY_HTTP_GET = """
import splashkit

response = splashkit.http_get("http://127.0.0.1/", 80)
splashkit.write_line("ESCAPED: http_get returned a response" if response else "BLOCKED")
"""

PY_READ_JUDGE_DATA = """
import splashkit

for path in ("/problems/aplusb/init.yml", "/judge/dmoj/judge.py", "/judge.yml", "/etc/shadow"):
    try:
        with open(path):
            splashkit.write_line("ESCAPED: read " + path)
            raise SystemExit(0)
    except OSError:
        pass
splashkit.write_line("BLOCKED")
"""

PY_HOSTILE = [
    ('py http_get', PY_HTTP_GET),
    ('py read judge data', PY_READ_JUDGE_DATA),
]
