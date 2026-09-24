# Installation

This page takes a machine with nothing installed to a working MOJ on `http://localhost:3000`, with a judge
container grading a real submission. For a public site behind TLS, read [production](/guide/production).

## Requirements

| Requirement | Version |
| --- | --- |
| Linux, or WSL2 | The judge sandbox needs `ptrace` and `seccomp` |
| Docker Engine with the Compose plugin | 24 or later |
| Node with the npm it ships | 24 or later |
| Git | any |
| RAM | 8 GB |
| Disk | 20 GB |

The invoking user must be in the `docker` group.

::: warning
macOS runs the site but not the judge. Do not install Docker from Ubuntu or Debian's `docker.io` package: it is
too old for the compose files.
:::

## Dependencies

::: code-group

```bash [Debian/Ubuntu]
. /etc/os-release
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL "https://download.docker.com/linux/$ID/gpg" -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/$ID ${UBUNTU_CODENAME:-$VERSION_CODENAME} stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"

curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs
```

```bash [Fedora]
sudo dnf -y install dnf-plugins-core git
sudo dnf config-manager addrepo --from-repofile=https://download.docker.com/linux/fedora/docker-ce.repo
sudo dnf -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"

curl -fsSL https://rpm.nodesource.com/setup_24.x | sudo -E bash -
sudo dnf -y install nodejs
```

```bash [Arch]
sudo pacman -Syu --needed docker docker-compose docker-buildx nodejs npm git
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
```

```bash [NixOS]
# In /etc/nixos/configuration.nix:
#   virtualisation.docker.enable = true;
#   users.users.YOURNAME.extraGroups = [ "docker" ];
sudo nixos-rebuild switch

nix-shell -p nodejs_24 git
```

:::

Group membership applies to new login sessions only. Run `newgrp docker`, then check:

```bash
docker --version
docker compose version
node --version
```

## Download

```bash
git clone https://github.com/MonashAPS/MOJ.git
cd MOJ
npm ci
```

## Configuration

```bash
npm run setup
```

`npm run setup` is idempotent and destroys no data. It:

1. starts the containers in `infra/compose.dev.yml`;
2. generates an admin key for the backend;
3. writes `.env.local` at the repository root and links `apps/web/.env.local` to it, keeping any existing
   `AUTH_SECRET`;
4. applies the database migrations;
5. sets `AUTH_ISSUER`, `AUTH_JWKS_URL` and, when the backend container can reach the host, `AUTH_URL` on the
   deployment;
6. pushes the backend functions;
7. seeds languages, navigation, misc config, problem groups and types, and the sample problem `aplusb`;
8. creates the development superuser and a non-admin development user, then prints their credentials.

`infra/.env.example` documents every variable. Set `MOJ_ADMIN_USERNAME`, `MOJ_ADMIN_PASSWORD`,
`MOJ_ADMIN_EMAIL`, `MOJ_USER_USERNAME`, `MOJ_USER_PASSWORD`, `MOJ_USER_EMAIL`, `MOJ_SITE_NAME` or
`MOJ_SITE_LONG_NAME` before running setup to override the defaults.

## Starting the site

```bash
npm run dev
```

Leave it running.

| Service | Address |
| --- | --- |
| Web app | `http://localhost:3000` |
| Client API | `http://127.0.0.1:3210` |
| Judge and problems API | `http://127.0.0.1:3211` |
| Database dashboard | `http://127.0.0.1:6791` |
| Database, user `moj` | `127.0.0.1:5433` |

::: warning
Open the site on `localhost`, not on `127.0.0.1`. The development server checks the origin of its hot-reload
socket, and the two names are different origins.
:::

Mail is written to the console (`MAIL_MODE=console`). Outside production the activation link for a new account
is also shown on `/accounts/register/complete/`.

## Adding a judge

The judge is behind a compose profile, so the stack comes up without it.

```bash
docker compose -f infra/compose.dev.yml --project-directory . --profile judge up -d judge
docker compose -f infra/compose.dev.yml --project-directory . logs -f judge
```

`--project-directory .` is required: the compose file's paths are relative to the repository root. The `judge`
service runs on host networking with `MOJ_URL=http://127.0.0.1:3211`, and grades from `infra/problems/`, which
already holds `aplusb`.

::: tip
Docker Desktop has no host networking. Use `--profile judge-bridge up -d judge-bridge` instead, which reaches
the published ports through `host.docker.internal`.
:::

Confirm grading end to end:

```bash
MOJ_JUDGE_KEY=localjudgekey npm run e2e:judge
```

It submits a reference solution to `aplusb` and waits for an Accepted verdict, creating the judge record if
there is none. The key has to match the container's: the compose default is `localjudgekey`, and the script's
own default is `local`. `MOJ_JUDGE_NAME` and `MOJ_E2E_TIMEOUT_MS` override the rest. A connected judge is listed
on `/status/`.

To pin the judge to a subset of the host's cores, copy `infra/compose.override.local.example.yml` to
`infra/compose.override.local.yml`, set `JUDGE_CPUSET`, and layer it in with a second `-f`.

## First admin login

Setup prints the local account credentials when it finishes. See
[test user credentials](/reference/development#test-user-credentials) for the defaults and administrator
two-factor login instructions.

## Updating

```bash
git pull
npm ci
npm run setup
```
