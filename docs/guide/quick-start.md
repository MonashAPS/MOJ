# Quick start

This page takes a machine with nothing installed and ends with a working MOJ: the site on
`http://localhost:3000`, a Convex backend, a Postgres database, and a judge container that grades a real
submission.

Everything here runs on Linux. WSL2 works the same way as the matching Ubuntu or Debian release. macOS can run the
site but not the judge, because the judge sandbox needs Linux `ptrace` and `seccomp`.

## Prerequisites

| Requirement | Why |
| --- | --- |
| Docker Engine 24 or later, with the Compose plugin | Runs the Convex backend, Postgres and the judge |
| Node 24 or later, with the npm that ships with it | Builds and runs the web app, the Convex functions and the tools |
| Git | Clones the repository |
| 8 GB of RAM, 20 GB of disk | The judge image and the Convex data directory are the large items |
| A user in the `docker` group | So `docker` works without `sudo` |

Docker Desktop also works, but on Linux the Docker Engine packages below are the ones the compose files are tested
against. Do not use the `docker.io` package from Ubuntu or Debian: it is old enough that `docker compose` and
BuildKit behave differently.

## Install Docker and Node

Pick your distribution. Each block is meant to be pasted whole into a shell.

::: code-group

```bash [Ubuntu 22.04]
# Docker Engine and the Compose plugin
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu jammy stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"

# Node 24
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs
```

```bash [Ubuntu 24.04]
# Docker Engine and the Compose plugin
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu noble stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"

# Node 24
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs
```

```bash [Debian 12]
# Docker Engine and the Compose plugin
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/debian bookworm stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"

# Node 24
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs
```

```bash [Debian 13]
# Docker Engine and the Compose plugin
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/debian trixie stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"

# Node 24. Debian 13 ships Node 20, which is too old for the workspaces.
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs
```

```bash [Fedora]
# Docker Engine and the Compose plugin
sudo dnf -y install dnf-plugins-core git
sudo dnf config-manager addrepo --from-repofile=https://download.docker.com/linux/fedora/docker-ce.repo
sudo dnf -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"

# Node 24
curl -fsSL https://rpm.nodesource.com/setup_24.x | sudo -E bash -
sudo dnf -y install nodejs

# On Fedora 40 and older, dnf4 wants the older repo syntax instead:
#   sudo dnf config-manager --add-repo https://download.docker.com/linux/fedora/docker-ce.repo
```

```bash [Arch]
# Docker Engine, the Compose plugin, buildx and Node all come from the official repositories
sudo pacman -Syu --needed docker docker-compose docker-buildx nodejs npm git
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"

# Arch tracks the current Node release, so `node --version` should already be v24 or newer.
```

```bash [NixOS]
# 1. Enable Docker system-wide in /etc/nixos/configuration.nix, then rebuild:
#
#   virtualisation.docker.enable = true;
#   users.users.YOURNAME.extraGroups = [ "docker" ];
#
sudo nixos-rebuild switch

# 2. Get Node 24 and git for this checkout with a shell.nix beside the repository:
cat > shell.nix <<'NIX'
{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  packages = with pkgs; [
    nodejs_24
    git
    docker-compose
    python3
  ];

  # The Convex backend and the judge run in containers, so nothing else is needed here.
  shellHook = ''
    export NPM_CONFIG_PREFIX="$PWD/.npm-global"
    export PATH="$NPM_CONFIG_PREFIX/bin:$PATH"
  '';
}
NIX

nix-shell
```

:::

Group membership only takes effect on a new login session. Either log out and back in, or run `newgrp docker` in
the shell you are about to use. Then check all three tools:

```bash
docker --version         # Docker version 24.x or newer
docker compose version   # Docker Compose version v2.x
node --version           # v24.x or newer
npm --version            # 11.x, whatever Node 24 ships
```

## Get the site running

```bash
git clone https://github.com/MonashAPS/MOJ.git
cd MOJ
npm ci
```

`npm ci` installs every workspace (`apps/*`, `packages/*`, `tools/*` and `docs`) from the committed lock file.

```bash
npm run setup
```

`npm run setup` is the one command that turns a fresh checkout into a working development environment. It is
idempotent, so it is safe to run again at any time and it never destroys data. It:

1. brings up `postgres`, `convex-backend` and `convex-dashboard` from `infra/compose.dev.yml`, and waits for the
   backend to answer;
2. generates a Convex admin key from the running backend;
3. writes `.env.local` at the repository root and a copy in `apps/web`, keeping any `AUTH_SECRET` that is already
   there so existing sessions survive;
4. runs the Drizzle migrations against the `moj_auth` database, creating the Better Auth tables;
5. sets `AUTH_ISSUER`, `AUTH_JWKS_URL` and, when the backend container can reach the host, `AUTH_URL` on the
   Convex deployment;
6. pushes the Convex functions;
7. seeds the languages, the navigation bar, the misc config defaults, the problem groups and types, and registers
   the sample problem `aplusb` that is committed under `infra/problems/`;
8. creates a development superuser and enrols it in two-factor authentication.

The last step matters for signing in. The dev superuser is `admin` with the password `admin` and the email
`admin@example.com`, already verified, with every DMOJ permission code. Change any of the three with
`MOJ_ADMIN_USERNAME`, `MOJ_ADMIN_PASSWORD` and `MOJ_ADMIN_EMAIL` before running setup.

Because that account is staff, and staff must hold a second factor, setup enrols it in TOTP against
`MOJ_DEV_TOTP_SECRET`, which it writes into `.env.local` with a fixed default. A fixed secret means the codes are
reproducible: point any authenticator app at the `otpauth://` URI setup prints, or generate a code from the secret
in a script. Five fixed scratch codes come with it, `mojde-vcode1` through `mojde-vcode5`, each usable once.

Never set `MOJ_DEV_TOTP_SECRET` on a real deployment. Without it, no enrolment happens and the account enrols
itself the ordinary way.

Then start the site:

```bash
npm run dev
```

That runs two processes side by side: `convex dev`, which pushes the functions in `convex/` to the local backend
and watches them, and `next dev`, which serves the web app. Leave it running.

| Service | Address | Notes |
| --- | --- | --- |
| Web app | `http://localhost:3000` | Next.js, the site itself |
| Convex API (cloud origin) | `http://127.0.0.1:3210` | Queries, mutations and actions from the browser |
| Convex HTTP actions (site origin) | `http://127.0.0.1:3211` | `/judge/*` and the problems API |
| Convex dashboard | `http://127.0.0.1:6791` | Tables and logs, useful when something looks wrong |
| Postgres | `127.0.0.1:5433`, user `moj` | Databases `moj_dev` and `moj_auth` |

Open the site on `localhost`, not on `127.0.0.1`. The development server checks the origin of its own hot-reload
socket, and the two names are different origins to a browser.

Mail is written to the server console rather than sent, so the activation link for any account you register is in
the terminal running `npm run dev`. Outside production it is also shown on `/accounts/register/complete/`.

## Start a judge

The judge is behind a compose profile, so the stack comes up without it. Build the image and start it:

```bash
docker compose -f infra/compose.dev.yml --project-directory . --profile judge up -d judge
```

The `--project-directory .` matters: the compose file uses paths relative to the repository root, so running it
from anywhere else mounts the wrong directories.

The judge container reads its problems from `infra/problems/`, which already contains `aplusb`, and reaches the
Convex HTTP origin through `host.docker.internal`. Watch it come up with
`docker compose -f infra/compose.dev.yml --project-directory . logs -f judge`; the handshake line names the site
and the number of problems found.

### Runtime tiers

`TIER` picks the runtime base image DMOJ publishes, and it decides which languages the judge can offer at all.

- **tier1** is enough for everything the club's problems use, C++23 and C23 included. The current image is Debian
  sid with GCC 16, so `CPP23` and `C23` both pass their self-tests on it, alongside C through C23, C++03 through
  C++23, Java 8, Python 2 and 3, PyPy 3, Pascal, Perl, x64 assembly, AWK, sed and plain text.
- **tier2** adds the mid-popularity runtimes.
- **tier3** adds the rest, and it is the tier that has Clang (`CLPP14` through `CLPP23`), Node.js (`NODEJS`),
  Lean 4 (`LEAN4`), ALGOL 68 (`ALGL68`) and LLVM IR (`LLC`). It is around 18 GB to pull.

The images come from Docker Hub. DMOJ's ghcr.io mirror has not been rebuilt since March 2022, and its tier 1 image
still ships GCC 11, which reports `__cplusplus` as `202100L` for `-std=c++23` and rejects `-std=c23` outright. Both
executors fail their self-tests against it, so a judge built on the mirror never reports C++23 or C23 to the site.

### When the Docker bridge cannot reach the host

On a Linux host whose firewall trusts only the loopback interface, a container on the default bridge cannot reach
a port published on the host, so every claim times out and nothing is ever graded. NixOS with the stock
`networking.firewall` rules is the common case.

There are two fixes. Either allow the bridge through the firewall (on NixOS, add `docker0` to
`networking.firewall.trustedInterfaces`), or run the judge with host networking, where it reaches the port on
`127.0.0.1` like everything else:

```bash
docker build --build-arg TIER=tier1 -t moj-judge:tier1 apps/judge

docker run --rm --network host \
  --cap-add SYS_PTRACE \
  -e MOJ_URL=http://127.0.0.1:3211 \
  -e JUDGE_NAME=local \
  -e JUDGE_KEY=localjudgekey \
  -v "$PWD/infra/problems:/problems" \
  moj-judge:tier1
```

The same firewall blocks the Convex backend container from fetching the web app's signing keys. Setup detects
that and works around it; [troubleshooting](/admin/troubleshooting) explains what it does and what it costs.

## Submit to `aplusb`

1. Open `http://localhost:3000` and click **Log in**.
2. Sign in as `admin` with the password `admin`, then answer the two-factor challenge with a code from the secret
   setup enrolled, or with one of the scratch codes. This account is a superuser, so the **Admin** link appears in
   the user dropdown at the top right.
3. Open `http://localhost:3000/problem/aplusb`. The statement asks for the sum of two integers.
4. Click **Submit solution**, choose Python 3, and paste:

   ```python
   a, b = map(int, input().split())
   print(a + b)
   ```

5. Click **Submit**. You land on `/submission/<id>`, which is a live query: the status moves from Queued to
   Processing to Grading, the test cases fill in one by one, and it ends on Accepted.

If nothing moves off Queued, the judge is not connected. Open `http://localhost:3000/status/`; a healthy judge is
listed there with a ping and a load figure. [Troubleshooting](/admin/troubleshooting) covers what to check.

There is also a scripted version of the same check, which submits the reference solution and waits for an
Accepted verdict:

```bash
npm run e2e:judge
```

It creates the judge record from `JUDGE_NAME` and `JUDGE_KEY` if one does not exist yet, so the judge can be
started before anything is in the database. Set `MOJ_JUDGE_NAME` and `MOJ_JUDGE_KEY` if the container is using
something other than the defaults, and `MOJ_E2E_TIMEOUT_MS` if a cold container needs longer than 120 seconds to
compile.

## Judge on a second machine

The judge does not accept connections. It polls the site over HTTPS and asks for work, so a judge box needs no
open ports, no public address and no VPN. It needs outbound access to the Convex site origin and a copy of the
problem data.

### 1. Create the judge on the site

In the staff console, open **Judges**, create a judge and fill in:

- **Name**: how the judge identifies itself, for example `judge-2`. It has to be unique, and two containers using
  one name will each disconnect the other.
- **Key**: generated for you. Copy it now; the site stores only its SHA-256 and cannot show it again.
- **Tier**: the runtime tier the box provides. Work is only handed to judges in the lowest online tier, so a fast
  dedicated box on tier 1 takes precedence over a spare laptop on tier 2.

### 2. Copy the problem data

The judge grades from files on its own disk. Give it the same problem directories the site's problem repositories
publish, one directory per problem code:

```bash
sudo mkdir -p /srv/problems
sudo rsync -avz --delete you@problems-host:~/problems/ /srv/problems/
```

Each directory is named after the problem code and contains an `init.yml` plus its test data. See
[problem format](/problems/format) for the layout and [problem repos and CI](/problems/repos-and-ci) for the
workflow that keeps this directory up to date.

### 3. Build and run the judge container

```bash
docker build --build-arg TIER=tier1 -t moj-judge:tier1 apps/judge

docker run -d \
  --name moj-judge \
  --restart unless-stopped \
  --cap-add SYS_PTRACE \
  -e MOJ_URL=https://convex-site.judge.example.org \
  -e JUDGE_NAME=judge-2 \
  -e JUDGE_KEY=the-key-you-copied \
  -v /srv/problems:/problems \
  moj-judge:tier1
```

- `MOJ_URL` is the **Convex site origin**, the host that serves the HTTP actions under `/judge/*`. It is not the
  web app's address. In development it is `http://127.0.0.1:3211`; in production it is whatever
  `CONVEX_SITE_ORIGIN` is set to (see [deployment](/admin/deployment)).
- `--cap-add SYS_PTRACE` is required. The sandbox traces each submission process to enforce the syscall policy,
  and without the capability every submission fails with an internal error.
- `-v /srv/problems:/problems` is where the judge looks for problems. It reports the problem codes it found
  during the handshake, and the site only sends it submissions for those codes.
- `--restart unless-stopped` brings the judge back after a reboot. It re-handshakes and picks up work again.

On first start the container writes `/problems/judge.yml` from a template with the name, the key and the problem
glob, and does not overwrite it afterwards. Set `JUDGE_CONFIG` with a matching mount to keep it somewhere other
than the problems volume.

Watch it come up:

```bash
docker logs -f moj-judge
```

The judge then appears on `/status/` and in the staff console under Judges, with its problem count and load. The
handshake takes as long as the executor self-tests do, usually under a minute.

### Runtime tiers

The base image decides which languages that judge can grade, and is chosen at build time with
`--build-arg TIER=`. The site only offers a language on the submit page if some online judge reports a runtime for
it, so a tier 1 estate means a tier 1 language list.

| Tier | Runtimes | Size |
| --- | --- | --- |
| `tier1` | C, C++ through C++20, Java 8, Python 2 and 3, Pascal, assembly, sed, plain text | about 1.2 GB built |
| `tier2` | Tier 1 plus the mid-popularity runtimes | larger |
| `tier3` | Everything the upstream judge supports | considerably larger |

Tier 1 is the right choice for a laptop or a small VPS, and for CI. Tier 3 is what to run in production if the
long tail of languages should stay submittable.

Mixing tiers is fine. Run the contest judges on one tier and keep a tier 3 box online for the rest. The image
tier and the judge's tier in the staff console are different things: the image decides what it *can* grade, and
the console tier decides which judges the site prefers, so a slow machine can be kept as an overflow judge.

`--cpuset-cpus` is worth setting if the box has work to do other than grading.

## Next steps

- [Architecture](/guide/architecture) explains what each process does and how a submission travels through them.
- [Compatibility with DMOJ](/guide/compatibility) is the list of what is the same and what is not.
- [Problem format](/problems/format) covers `init.yml`, statements and `config.json`.
- [Deployment](/admin/deployment) covers the production compose file, Caddy and backups.
