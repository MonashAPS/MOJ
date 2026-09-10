#!/usr/bin/env node
/**
 * One command to get MOJ running locally. Idempotent: safe to re-run at any
 * time, and it never destroys data. `npm run setup`.
 *
 * Steps:
 *   1. docker compose up for postgres, the Convex backend and the dashboard
 *   2. wait for the backend to answer /version
 *   3. generate the Convex admin key
 *   4. write .env.local (root and apps/web), keeping any existing AUTH_SECRET
 *   5. drizzle migrations for the Better Auth database
 *   6. push the Convex functions and set the deployment's env vars
 *   7. seed languages, nav bar, misc config, groups/types and the sample problem
 *   8. create the dev superuser admin/admin
 */

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const COMPOSE_FILE = join("infra", "compose.dev.yml");
const ENV_LOCAL = join(ROOT, ".env.local");
const WEB_ENV_LOCAL = join(ROOT, "apps", "web", ".env.local");

const CONVEX_URL = process.env.CONVEX_URL ?? "http://127.0.0.1:3210";
const CONVEX_SITE_URL = process.env.CONVEX_SITE_URL ?? "http://127.0.0.1:3211";
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://moj:moj@127.0.0.1:5433/moj_auth";

const ADMIN_USERNAME = process.env.MOJ_ADMIN_USERNAME ?? "admin";
const ADMIN_PASSWORD = process.env.MOJ_ADMIN_PASSWORD ?? "admin";
const ADMIN_EMAIL = process.env.MOJ_ADMIN_EMAIL ?? "admin@example.com";

// DMOJ's permission codes, from spec section 3.
const ADMIN_PERMISSIONS = [
  "judge.edit_all_problem",
  "judge.edit_own_problem",
  "judge.edit_public_problem",
  "judge.see_private_problem",
  "judge.clone_problem",
  "judge.problem_full_markup",
  "judge.change_public_visibility",
  "judge.see_private_contest",
  "judge.contest_rating",
  "judge.lock_contest",
  "judge.moss_contest",
  "judge.rejudge_submission",
  "judge.view_all_submission",
  "judge.spam_submission",
  "judge.edit_all_post",
  "judge.organization_admin",
  "judge.test_site",
  "judge.totp",
];

// This machine has two faulty cores; every heavy child process is pinned.
const CPU_PIN = ["taskset", "-c", "0-11,14-31"];

const CYAN = "\u001b[36m";
const RED = "\u001b[31m";
const RESET = "\u001b[0m";

function step(message) {
  process.stdout.write(`\n${CYAN}==>${RESET} ${message}\n`);
}

function info(message) {
  process.stdout.write(`    ${message}\n`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    env: { ...process.env, ...options.env },
    encoding: "utf8",
  });
  if (result.status !== 0 && !options.allowFailure) {
    if (options.capture) {
      process.stderr.write(result.stdout ?? "");
      process.stderr.write(result.stderr ?? "");
    }
    throw new Error(`${command} ${args.join(" ")} exited with ${result.status}`);
  }
  return result;
}

function pinned(command, args, options) {
  return run(CPU_PIN[0], [CPU_PIN[1], CPU_PIN[2], command, ...args], options);
}

function compose(args, options) {
  return pinned("docker", ["compose", "-f", COMPOSE_FILE, "--project-directory", ".", ...args], options);
}

async function waitFor(label, check, { timeoutMs = 180_000, intervalMs = 1000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let announced = false;
  while (Date.now() < deadline) {
    if (await check()) {
      if (announced) process.stdout.write("\n");
      return;
    }
    if (!announced) {
      process.stdout.write(`    waiting for ${label}`);
      announced = true;
    }
    process.stdout.write(".");
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  if (announced) process.stdout.write("\n");
  throw new Error(`timed out waiting for ${label}`);
}

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    out[trimmed.slice(0, index)] = trimmed.slice(index + 1);
  }
  return out;
}

function renderEnvFile(values) {
  return `${[
    "# Written by npm run setup. Safe to edit; re-running setup keeps AUTH_SECRET",
    "# and refreshes the Convex admin key. Never commit this file.",
    "",
    ...Object.entries(values).map(([key, value]) => `${key}=${value}`),
    "",
  ].join("\n")}`;
}

/** Can the Convex backend container open a connection to the web app on the
 *  host? Docker's host-gateway makes this work out of the box on most machines,
 *  but a host firewall that filters the bridge subnets breaks it. We probe with
 *  a throwaway listener on the same port the dev server uses. */
async function backendCanReachHost(jwksUrl) {
  const probe = () =>
    compose(["exec", "-T", "convex-backend", "curl", "-sf", "-m", "5", "-o", "/dev/null", jwksUrl], {
      capture: true,
      allowFailure: true,
    }).status === 0;

  if (probe()) return true;

  const port = Number(new URL(APP_URL).port || "3000");
  let server;
  try {
    server = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end('{"keys":[]}');
    });
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "0.0.0.0", resolve);
    });
  } catch {
    // Port already taken (the dev server is up) and the first probe failed.
    return false;
  }

  try {
    return probe();
  } finally {
    server.close();
  }
}

async function main() {
  step("Starting the development stack (postgres, convex-backend, convex-dashboard)");
  compose(["up", "-d", "postgres", "convex-backend", "convex-dashboard"]);

  step("Waiting for the Convex backend");
  await waitFor("convex-backend", async () => {
    try {
      const response = await fetch(`${CONVEX_URL}/version`, { signal: AbortSignal.timeout(2000) });
      return response.ok;
    } catch {
      return false;
    }
  });
  info(`backend up at ${CONVEX_URL}`);

  step("Generating the Convex admin key");
  const keyResult = compose(["exec", "-T", "convex-backend", "./generate_admin_key.sh"], {
    capture: true,
  });
  const adminKey = (keyResult.stdout ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);
  if (!adminKey?.includes("|")) {
    throw new Error(`could not parse the admin key from generate_admin_key.sh:\n${keyResult.stdout}`);
  }
  info(`admin key ${adminKey.slice(0, 12)}...`);

  step("Writing .env.local");
  const existing = parseEnvFile(ENV_LOCAL);
  const authSecret = existing.AUTH_SECRET || randomBytes(32).toString("base64url");
  const env = {
    CONVEX_SELF_HOSTED_URL: CONVEX_URL,
    CONVEX_SELF_HOSTED_ADMIN_KEY: adminKey,
    CONVEX_TMPDIR: join(ROOT, ".convex-tmp"),
    NEXT_PUBLIC_CONVEX_URL: CONVEX_URL,
    NEXT_PUBLIC_CONVEX_SITE_URL: CONVEX_SITE_URL,
    NEXT_PUBLIC_APP_URL: APP_URL,
    DATABASE_URL,
    AUTH_SECRET: authSecret,
    AUTH_ISSUER: APP_URL,
    AUTH_JWKS_URL: "http://host.docker.internal:3000/api/auth/jwks",
    AUTH_RP_ID: new URL(APP_URL).hostname,
    MAIL_MODE: existing.MAIL_MODE || "console",
    MAIL_FROM: existing.MAIL_FROM || "noreply@example.com",
  };
  const rendered = renderEnvFile(env);
  writeFileSync(ENV_LOCAL, rendered);
  writeFileSync(WEB_ENV_LOCAL, rendered);
  info(".env.local and apps/web/.env.local written");

  // Everything below wants these in the environment, not just the file.
  Object.assign(process.env, env);

  step("Running the Better Auth database migrations");
  pinned("npm", ["run", "db:migrate", "--workspace", "apps/web"], { env });

  step("Setting the Convex deployment environment");
  pinned("npx", ["convex", "env", "set", "AUTH_ISSUER", env.AUTH_ISSUER], { env, capture: true });
  info(`AUTH_ISSUER=${env.AUTH_ISSUER}`);

  let jwksValue = env.AUTH_JWKS_URL;
  if (await backendCanReachHost(env.AUTH_JWKS_URL)) {
    info(`AUTH_JWKS_URL=${jwksValue}`);
  } else {
    // Convex also accepts the key set inline as a data URI. Re-run setup after
    // rotating the signing keys so the deployment picks up the new set.
    const printed = pinned("npx", ["tsx", "apps/web/scripts/print-jwks.ts"], { env, capture: true });
    const jwks = (printed.stdout ?? "").trim().split("\n").at(-1);
    if (!jwks?.startsWith("{")) {
      process.stderr.write(printed.stdout ?? "");
      process.stderr.write(printed.stderr ?? "");
      throw new Error("could not read the JWKS from print-jwks.ts");
    }
    jwksValue = `data:text/plain;charset=utf-8;base64,${Buffer.from(jwks, "utf8").toString("base64")}`;
    info("the convex container cannot reach the host, so the JWKS is inlined as a data URI");
    info("re-run npm run setup if the Better Auth signing keys are ever rotated");
  }
  pinned("npx", ["convex", "env", "set", "AUTH_JWKS_URL", jwksValue], { env, capture: true });

  step("Pushing the Convex functions");
  pinned("npx", ["convex", "dev", "--once"], { env });

  step("Seeding languages, navigation, config and the sample problem");
  const seed = pinned("npx", ["convex", "run", "seed:run", "{}"], { env, capture: true });
  info((seed.stdout ?? "").trim().replace(/\n/g, "\n    "));

  step(`Creating the development superuser ${ADMIN_USERNAME}/${ADMIN_PASSWORD}`);
  const created = pinned(
    "npx",
    ["tsx", "apps/web/scripts/create-admin.ts", ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_EMAIL],
    { env, capture: true },
  );
  const lastLine = (created.stdout ?? "").trim().split("\n").at(-1) ?? "";
  let userId;
  try {
    userId = JSON.parse(lastLine).userId;
  } catch {
    process.stderr.write(created.stdout ?? "");
    process.stderr.write(created.stderr ?? "");
    throw new Error("could not read the admin user id from create-admin.ts");
  }
  info(`better auth user ${userId}`);

  pinned(
    "npx",
    [
      "convex",
      "run",
      "profiles:ensureProfileForUser",
      JSON.stringify({
        userId,
        username: ADMIN_USERNAME,
        timezone: "Australia/Melbourne",
        languageKey: "PY3",
        isStaff: true,
        isSuperuser: true,
        permissions: ADMIN_PERMISSIONS,
        displayRank: "admin",
      }),
    ],
    { env, capture: true },
  );
  info("convex profile created");

  step("Done");
  process.stdout.write(
    [
      "",
      "  Start the site with:   npm run dev",
      `  Web:                   ${APP_URL}`,
      "  Convex dashboard:      http://127.0.0.1:6791",
      `  Sign in as:            ${ADMIN_USERNAME} / ${ADMIN_PASSWORD}`,
      "",
      "  Mail is written to the server console (MAIL_MODE=console); activation",
      "  links also appear on /accounts/register/complete/ outside production.",
      "",
    ].join("\n"),
  );
}

main().catch((error) => {
  process.stderr.write(`\n${RED}setup failed:${RESET} ${error.message}\n`);
  process.exit(1);
});
