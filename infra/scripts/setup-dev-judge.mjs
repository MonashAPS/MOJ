#!/usr/bin/env node
/** Register a local judge and supply grading data for all seeded development problems. */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

const DATA = join(ROOT, ".local/judge-problems");

/** Docker Desktop reaches the host through its gateway, keeping the site's port and path. */
function judgeUrl(siteUrl, service, override) {
  if (override) return override;
  const url = new URL(siteUrl);

  if (service === "judge-bridge" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    url.hostname = "host.docker.internal";
  }

  return url.href;
}

async function main() {
  process.loadEnvFile(join(ROOT, ".env.local"));
  const url = process.env.CONVEX_SELF_HOSTED_URL;
  const adminKey = process.env.CONVEX_SELF_HOSTED_ADMIN_KEY;

  if (!url || !adminKey) throw new Error("Run npm run setup first.");

  if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)) {
    throw new Error("setup:judge is only for a local Convex deployment.");
  }

  const name = process.env.MOJ_JUDGE_NAME ?? process.env.JUDGE_NAME ?? "local";
  const key = process.env.MOJ_JUDGE_KEY ?? process.env.JUDGE_KEY ?? "localjudgekey";
  const admin = new ConvexHttpClient(url);
  admin.setAdminAuth(adminKey);

  const prepared = await admin.mutation(makeFunctionReference("judgeApi:prepareEndToEnd"), {
    judgeName: name,
    authKeyHash: createHash("sha256").update(key).digest("hex"),
    username: process.env.MOJ_ADMIN_USERNAME ?? "admin",
  });

  if (!prepared.userId) throw new Error("The development admin is missing; run npm run setup first.");

  if (!prepared.keyMatches) {
    throw new Error("The local judge already has another key; set MOJ_JUDGE_KEY to its existing key.");
  }

  await admin.mutation(makeFunctionReference("seed:run"), { devContests: true });
  mkdirSync(DATA, { recursive: true });
  cpSync(join(ROOT, "infra/problems/aplusb"), join(DATA, "aplusb"), { recursive: true });

  for (const [code, expression, answer] of [
    ["atimesb", "a * b", (a, b) => a * b],
    ["aminusb", "a - b", (a, b) => a - b],
    ["maxab", "max(a, b)", (a, b) => Math.max(a, b)],
    ["minab", "min(a, b)", (a, b) => Math.min(a, b)],
    ["absdiff", "abs(a - b)", (a, b) => Math.abs(a - b)],
  ]) {
    const limit = code === "atimesb" ? 10000 : 1000000000;

    const inputs = [
      [3, 4],
      [-5, 0],
      [limit, -limit],
      [0, 0],
      [-5, 3],
      [100, 200],
    ];

    const directory = join(DATA, code);
    mkdirSync(join(directory, "tests"), { recursive: true });
    writeFileSync(join(directory, "sol.py"), `a, b = map(int, input().split())\nprint(${expression})\n`);

    for (const [index, [a, b]] of inputs.entries()) {
      writeFileSync(join(directory, "tests", `${index}.in`), `${a} ${b}\n`);
      writeFileSync(join(directory, "tests", `${index}.out`), `${answer(a, b)}\n`);
    }

    const cases = inputs.map((_, index) => `  - {in: tests/${index}.in, out: tests/${index}.out}`);
    writeFileSync(
      join(directory, "init.yml"),
      `test_cases:\n- batched:\n${cases.slice(0, 2).join("\n")}\n  points: 0\n- batched:\n${cases.slice(2).join("\n")}\n  points: 100\n`,
    );
  }

  const service = ["darwin", "win32"].includes(process.platform) ? "judge-bridge" : "judge";

  const siteUrl =
    process.env.CONVEX_SITE_URL ?? process.env.NEXT_PUBLIC_CONVEX_SITE_URL ?? "http://127.0.0.1:3211";

  const result = spawnSync(
    "docker",
    [
      "compose",
      "-f",
      "infra/compose.dev.yml",
      "--project-directory",
      ".",
      "--profile",
      service,
      "up",
      "-d",
      "--build",
      service,
    ],
    {
      cwd: ROOT,
      stdio: "inherit",
      env: {
        ...process.env,
        JUDGE_NAME: name,
        JUDGE_KEY: key,
        MOJ_PROBLEMS_DIR: DATA,
        MOJ_JUDGE_URL: judgeUrl(siteUrl, service, process.env.MOJ_JUDGE_URL),
      },
    },
  );

  if (result.error) throw result.error;

  if (result.status !== 0) throw new Error(`Docker exited with ${result.status}.`);
  process.stdout.write(
    `Local judge ${name} started with data in ${DATA}.\nRun npm run e2e:judge after its runtime self-tests finish.\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`setup:judge failed: ${error.message}\n`);
  process.exitCode = 1;
});
