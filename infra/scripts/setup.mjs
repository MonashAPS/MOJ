#!/usr/bin/env node
/**
 * One command to get MOJ running locally. Idempotent: safe to re-run at any
 * time, and it never destroys data. `npm run setup`.
 *
 * Steps:
 *   1. docker compose up for postgres, the Convex backend and the dashboard
 *   2. wait for the backend to answer /version
 *   3. generate the Convex admin key
 *   4. write .env.local and link apps/web/.env.local to it, keeping any existing AUTH_SECRET
 *   5. drizzle migrations for the Better Auth database
 *   6. push the Convex functions and set the deployment's env vars
 *   7. seed languages, nav bar, misc config, groups/types and the sample problem
 *   8. create the dev superuser and print its credentials
 */

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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

/**
 * What the Convex deployment calls to verify a problems-API key against Better
 * Auth. The backend is in Docker, so the host gateway, not localhost.
 */
const AUTH_URL = process.env.AUTH_URL ?? "http://host.docker.internal:3000";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://moj:moj@127.0.0.1:5433/moj_auth";

/** Fixed so a code for the dev superuser can be generated from a test, and so
 *  a re-run of setup does not lock the account out of an authenticator app. */
const DEV_TOTP_SECRET = "mojdevtotpsecretdonotuseinprod01";

const ADMIN_USERNAME = process.env.MOJ_ADMIN_USERNAME ?? "admin";

/**
 * Not `admin`: that one is in the Have I Been Pwned corpus forty million times
 * over, and the site's own breached-password check would send the documented
 * dev login straight to the forced-change interstitial. This one is not in the
 * corpus, and it is still obviously a throwaway.
 */
const ADMIN_PASSWORD = process.env.MOJ_ADMIN_PASSWORD ?? "moj-admin-local";

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

/**
 * Optional CPU pinning for the heavy child processes, for a machine that has to
 * keep some cores free (or has cores that must not be used at all). Set
 * `MOJ_CPUSET` to a taskset-style list, e.g. `MOJ_CPUSET=0-11,14-31`. Unset,
 * nothing is pinned, which is the only default that works everywhere.
 */
const CPU_PIN = process.env.MOJ_CPUSET ? ["taskset", "-c", process.env.MOJ_CPUSET] : [];

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
  if (CPU_PIN.length === 0) return run(command, args, options);

  return run(CPU_PIN[0], [...CPU_PIN.slice(1), command, ...args], options);
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
    AUTH_URL,
    // DMOJ's SECRET_KEY, so API v2 tokens minted by the old site still verify.
    // Only set once a dump has been imported; blank is fine on a fresh install.
    LEGACY_SECRET_KEY: existing.LEGACY_SECRET_KEY || "",
    MAIL_MODE: existing.MAIL_MODE || "console",
    MAIL_FROM: existing.MAIL_FROM || "noreply@example.com",
    // The dev superuser is staff, and staff must hold a second factor, so it is
    // enrolled in TOTP against a fixed secret. Codes for it are reproducible,
    // which is what lets a test log the account in. Development only: a
    // production deploy must not carry this, and setup is a dev script.
    MOJ_DEV_TOTP_SECRET: existing.MOJ_DEV_TOTP_SECRET || DEV_TOTP_SECRET,
  };

  const rendered = renderEnvFile(env);
  writeFileSync(ENV_LOCAL, rendered);
  rmSync(WEB_ENV_LOCAL, { force: true });
  symlinkSync(join("..", "..", ".env.local"), WEB_ENV_LOCAL);
  info(".env.local written, apps/web/.env.local linked to it");

  // Everything below wants these in the environment, not just the file.
  Object.assign(process.env, env);

  step("Running the Better Auth database migrations");
  pinned("npm", ["run", "db:migrate", "--workspace", "apps/web"], { env });

  step("Setting the Convex deployment environment");
  pinned("npx", ["convex", "env", "set", "AUTH_ISSUER", env.AUTH_ISSUER], { env, capture: true });
  info(`AUTH_ISSUER=${env.AUTH_ISSUER}`);

  let jwksValue = env.AUTH_JWKS_URL;
  const hostReachable = await backendCanReachHost(env.AUTH_JWKS_URL);

  if (hostReachable) {
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

  // `convex/http/problemsApi.ts` verifies API keys against Better Auth over
  // AUTH_URL and falls back to the `apiKeys` table when it is unset. The same
  // firewall that blocks the JWKS fetch blocks this one, so reuse the probe:
  // an unreachable host means the fallback, not a URL that always times out.
  if (hostReachable) {
    pinned("npx", ["convex", "env", "set", "AUTH_URL", env.AUTH_URL], { env, capture: true });
    info(`AUTH_URL=${env.AUTH_URL}`);
  } else {
    pinned("npx", ["convex", "env", "remove", "AUTH_URL"], {
      env,
      capture: true,
      allowFailure: true,
    });
    info("the convex container cannot reach the host, so AUTH_URL is left unset");
    info("problems-API keys are verified against the apiKeys table instead");
  }

  if (env.LEGACY_SECRET_KEY) {
    pinned("npx", ["convex", "env", "set", "LEGACY_SECRET_KEY", env.LEGACY_SECRET_KEY], {
      env,
      capture: true,
    });
    info("LEGACY_SECRET_KEY set on the deployment");
  }

  step("Pushing the Convex functions");
  pinned("npx", ["convex", "dev", "--once"], { env });

  step("Seeding languages, navigation, config and the sample problem");

  // SPEC section 24: an operator names the instance from the environment.
  // A name that is not set stays absent, so seed:run keeps its own default.
  const seedOptions = {};

  if (process.env.MOJ_SITE_NAME) seedOptions.siteName = process.env.MOJ_SITE_NAME;

  if (process.env.MOJ_SITE_LONG_NAME) seedOptions.siteLongName = process.env.MOJ_SITE_LONG_NAME;

  const seedArgs = JSON.stringify(seedOptions);

  const seed = pinned("npx", ["convex", "run", "seed:run", seedArgs], { env, capture: true });
  info((seed.stdout ?? "").trim().replace(/\n/g, "\n    "));

  step(`Creating the development superuser ${ADMIN_USERNAME}`);
  info("enrolling it in two factor authentication against MOJ_DEV_TOTP_SECRET");

  const created = pinned(
    "npx",
    ["tsx", "apps/web/scripts/create-admin.ts", ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_EMAIL],
    { env, capture: true },
  );

  const lastLine = (created.stdout ?? "").trim().split("\n").at(-1) ?? "";
  let userId;
  let totpUri;

  try {
    ({ userId, totpUri } = JSON.parse(lastLine));
  } catch {
    process.stderr.write(created.stdout ?? "");
    process.stderr.write(created.stderr ?? "");
    throw new Error("could not read the admin user id from create-admin.ts");
  }

  info(`better auth user ${userId}`);

  if (totpUri) info(`totp ${totpUri}`);

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
      "",
      "  Development superuser",
      `    username:            ${ADMIN_USERNAME}`,
      `    password:            ${ADMIN_PASSWORD}`,
      `    email:               ${ADMIN_EMAIL}`,
      `    totp secret:         ${env.MOJ_DEV_TOTP_SECRET}`,
      ...(totpUri ? [`    totp uri:            ${totpUri}`] : []),
      "",
      "  Staff must hold a second factor, so the account is enrolled in TOTP",
      "  against that fixed secret. Generate a code from the URI with any",
      "  authenticator, or with otpauth: URI.parse(uri).generate().",
      "",
      "  Override the credentials with MOJ_ADMIN_USERNAME, MOJ_ADMIN_PASSWORD",
      "  and MOJ_ADMIN_EMAIL before running setup.",
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
