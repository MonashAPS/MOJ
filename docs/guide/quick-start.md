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
| Node 24 or later, with npm 10 or later | Builds and runs the web app, the Convex functions and the tools |
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
npm --version            # 10.x or newer
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

`npm run setup` is the one command that turns a fresh checkout into a working development environment. It:

1. brings up `infra/compose.dev.yml`, which starts the Convex backend, the Convex dashboard, Postgres and a judge
   container;
2. generates a Convex admin key from the running backend and writes `.env.local` at the repository root;
3. runs the Drizzle migrations against the `moj_auth` database, creating the Better Auth tables;
4. seeds the languages, the navigation bar, the misc config entries and the site settings;
5. creates a development administrator, username `admin`, password `admin`;
6. writes a sample problem `aplusb` into `infra/problems/` and registers it on the site;
7. creates a judge record whose key matches the one the judge container is started with.

Then start the site:

```bash
npm run dev
```

That runs two processes side by side: `convex dev`, which pushes the functions in `convex/` to the local backend and
watches them, and `next dev`, which serves the web app. Leave it running.

| Service | Address | Notes |
| --- | --- | --- |
| Web app | `http://localhost:3000` | Next.js, the site itself |
| Convex API (cloud origin) | `http://127.0.0.1:3210` | Queries, mutations and actions from the browser |
| Convex HTTP actions (site origin) | `http://127.0.0.1:3211` | `/judge/*`, the problems API, feeds |
| Convex dashboard | `http://127.0.0.1:6791` | Tables and logs, useful when something looks wrong |
| Postgres | `127.0.0.1:5433` | Databases `convex` and `moj_auth` |

## Submit to `aplusb`

1. Open `http://localhost:3000` and click **Log in**.
2. Log in as `admin` with the password `admin`. This account is a superuser, so the **Admin** link appears in the
   user dropdown at the top right.
3. Open `http://localhost:3000/problem/aplusb`. The statement asks for the sum of two integers.
4. Click **Submit solution**, choose Python 3, and paste:

   ```python
   a, b = map(int, input().split())
   print(a + b)
   ```

5. Click **Submit**. You land on `/submission/<id>`, which is a live query: the status moves from Queued to
   Processing to Grading, the test cases fill in one by one, and it ends on Accepted.

If nothing moves off Queued, the judge container is not connected. Open `http://localhost:3000/status/`; a healthy
judge is listed there with a ping and a load figure. [Troubleshooting](/admin/troubleshooting) covers what to check.

There is also a scripted version of the same check, which submits to `aplusb` and waits for an Accepted verdict:

```bash
npm run e2e:judge
```

## Judge on a second machine

The judge does not accept connections. It polls the site over HTTPS and asks for work, so a judge box needs no open
ports, no public address and no VPN. It needs outbound access to the Convex site origin and a copy of the problem
data.

### 1. Create the judge on the site

In the staff console, open **Judges**, click **New judge** and fill in:

- **Name**: how the judge identifies itself, for example `judge-2`. It has to be unique.
- **Key**: click **Generate**. Copy the key now; the site stores only its SHA-256 hash and cannot show it again.
- **Tier**: the runtime tier the box provides. The claim rules only hand work to judges in the lowest online tier,
  so a fast dedicated box on tier 1 takes precedence over a spare laptop on tier 2.
- **Description**: free text, shown on `/status/`.

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

### 3. Run the judge container

```bash
docker run -d \
  --name moj-judge \
  --restart unless-stopped \
  --cap-add SYS_PTRACE \
  -e MOJ_URL=https://convex-site.example.org \
  -e JUDGE_NAME=judge-2 \
  -e JUDGE_KEY=the-key-you-copied \
  -v /srv/problems:/problems \
  ghcr.io/monashaps/moj-judge:tier1
```

- `MOJ_URL` is the **Convex site origin**, the host that serves the HTTP actions under `/judge/*`. It is not the
  web app's address. In development it is `http://127.0.0.1:3211`; in production it is whatever
  `CONVEX_SITE_ORIGIN` is set to (see [deployment](/admin/deployment)).
- `--cap-add SYS_PTRACE` is required. The sandbox traces each submission process to enforce the syscall policy, and
  without the capability every submission fails with an internal error.
- `-v /srv/problems:/problems` is where the judge looks for problems. The container reports the problem codes it
  found during the handshake, and the site only sends it submissions for those codes.
- `--restart unless-stopped` brings the judge back after a reboot. It re-handshakes and picks up work again.

On the same machine as the site, point at the host from inside the container:

```bash
docker run -d \
  --name moj-judge \
  --restart unless-stopped \
  --cap-add SYS_PTRACE \
  --add-host host.docker.internal:host-gateway \
  -e MOJ_URL=http://host.docker.internal:3211 \
  -e JUDGE_NAME=judge-local \
  -e JUDGE_KEY=devkey \
  -v "$PWD/infra/problems:/problems" \
  ghcr.io/monashaps/moj-judge:tier1
```

Watch it come up:

```bash
docker logs -f moj-judge
```

The handshake line names the site and the number of problems found. The judge then appears on `/status/` and on
`/admin/judges`.

### Runtime tiers

The image tier decides which languages that judge can grade. The site only offers a language on the submit page if
some online judge reports a runtime for it, so a tier 1 estate means a tier 1 language list.

| Tag | Runtimes | Approximate image size |
| --- | --- | --- |
| `ghcr.io/monashaps/moj-judge:tier1` | Python 2 and 3, C, C++ (GCC), Java, Pascal | about 1 GB |
| `ghcr.io/monashaps/moj-judge:tier2` | Tier 1 plus the commonly requested extras, including C# and Rust | about 3 GB |
| `ghcr.io/monashaps/moj-judge:tier3` | Everything the upstream DMOJ judge supports, roughly 60 runtimes | about 8 GB |

Sizes are approximate and grow as runtimes are updated; run `docker image ls` after a pull for the real figure.
Tier 1 is the right choice for a laptop or a small VPS, and for CI. Tier 3 is what the club runs in production so
that Haskell, Rust and the rest stay submittable.

Mixing tiers is fine. Run the contest judges on one tier and keep a tier 3 box online for the long tail of
languages. Because claiming prefers the lowest online tier, put the fastest hardware on the lowest tier number.

## Next steps

- [Architecture](/guide/architecture) explains what each process does and how a submission travels through them.
- [Problem format](/problems/format) covers `init.yml`, statements and `config.json`.
- [Deployment](/admin/deployment) covers the production compose file, Caddy and backups.
