#!/usr/bin/env node
/**
 * End to end: submit the reference solution for `aplusb` and wait for AC.
 *
 * This is the integration test for the whole grading path — the site, the judge
 * container polling it, and the problem data on the volume between them. It
 * needs a running stack (`npm run setup`, then `npm run dev`) and a judge
 * container started with the same name and key.
 *
 *   npm run e2e:judge
 *   MOJ_JUDGE_NAME=local MOJ_JUDGE_KEY=local npm run e2e:judge
 *
 * What it does:
 *   1. reads CONVEX_SELF_HOSTED_URL and the admin key from .env.local
 *   2. creates the judge row with sha256(key) if it is not already there
 *   3. submits infra/problems/aplusb/sol.py as the admin, through the real
 *      `submissions.submit` mutation, so every rule it enforces is exercised
 *   4. polls the submission for up to 120 seconds and prints the case rows
 *
 * Exits non-zero unless the submission ends D/AC.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ENV_LOCAL = join(ROOT, ".env.local");
const SOLUTION = join(ROOT, "infra", "problems", "aplusb", "sol.py");

const PROBLEM_CODE = process.env.MOJ_E2E_PROBLEM ?? "aplusb";
const LANGUAGE_KEY = process.env.MOJ_E2E_LANGUAGE ?? "PY3";
const ADMIN_USERNAME = process.env.MOJ_ADMIN_USERNAME ?? "admin";
const JUDGE_NAME = process.env.MOJ_JUDGE_NAME ?? process.env.JUDGE_NAME ?? "local";
const JUDGE_KEY = process.env.MOJ_JUDGE_KEY ?? process.env.JUDGE_KEY ?? "local";
const TIMEOUT_MS = Number(process.env.MOJ_E2E_TIMEOUT_MS ?? 120_000);
const POLL_MS = 1000;

const CYAN = "[36m";
const RED = "[31m";
const GREEN = "[32m";
const DIM = "[2m";
const RESET = "[0m";

const prepareEndToEnd = makeFunctionReference("judgeApi:prepareEndToEnd");
const submit = makeFunctionReference("submissions:submit");
const detailQuery = makeFunctionReference("submissions:detail");

function step(message) {
  process.stdout.write(`\n${CYAN}==>${RESET} ${message}\n`);
}

function info(message) {
  process.stdout.write(`    ${message}\n`);
}

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const env = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }
  return env;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatCase(row) {
  const parts = [
    `case ${String(row.case).padStart(2, " ")}`,
    String(row.status).padEnd(4, " "),
    `${row.points}/${row.total}`.padEnd(9, " "),
    `${(row.time ?? 0).toFixed(3)}s`.padStart(8, " "),
    `${Math.round((row.memory ?? 0) / 1024)}MB`.padStart(7, " "),
  ];
  if (row.batch) parts.push(`batch ${row.batch}`);
  if (row.feedback) parts.push(row.feedback);
  return parts.join("  ");
}

function verdict(submission) {
  return `${submission.status}${submission.result ? `/${submission.result}` : ""}`;
}

async function main() {
  const fileEnv = parseEnvFile(ENV_LOCAL);
  const url = process.env.CONVEX_SELF_HOSTED_URL ?? fileEnv.CONVEX_SELF_HOSTED_URL;
  const adminKey = process.env.CONVEX_SELF_HOSTED_ADMIN_KEY ?? fileEnv.CONVEX_SELF_HOSTED_ADMIN_KEY;
  if (!url || !adminKey) {
    throw new Error(
      "CONVEX_SELF_HOSTED_URL and CONVEX_SELF_HOSTED_ADMIN_KEY are needed; run npm run setup first.",
    );
  }
  if (!existsSync(SOLUTION)) throw new Error(`no reference solution at ${SOLUTION}`);
  const source = readFileSync(SOLUTION, "utf8");

  step(`Talking to ${url}`);
  const admin = new ConvexHttpClient(url);
  admin.setAdminAuth(adminKey);

  step(`Making sure the judge "${JUDGE_NAME}" and the user "${ADMIN_USERNAME}" exist`);
  const authKeyHash = createHash("sha256").update(JUDGE_KEY, "utf8").digest("hex");
  const prepared = await admin.mutation(prepareEndToEnd, {
    judgeName: JUDGE_NAME,
    authKeyHash,
    username: ADMIN_USERNAME,
  });
  if (!prepared.userId) {
    throw new Error(`no profile for "${ADMIN_USERNAME}"; run npm run setup first`);
  }
  info(prepared.created ? `created judge ${JUDGE_NAME}` : `judge ${JUDGE_NAME} already exists`);
  if (!prepared.keyMatches) {
    info(`${RED}the stored key hash does not match MOJ_JUDGE_KEY${RESET}; the judge will get a 403`);
  }
  info(`submitting as ${ADMIN_USERNAME} (${prepared.userId})`);

  // Submitting through the public mutation as the admin, so every DMOJ rule in
  // submissions.submit runs: accessibility, allowed language, rate limits.
  const asUser = new ConvexHttpClient(url);
  asUser.setAdminAuth(adminKey, {
    subject: prepared.userId,
    issuer: "https://convex.test",
    tokenIdentifier: `https://convex.test|${prepared.userId}`,
  });

  step(`Submitting ${PROBLEM_CODE} in ${LANGUAGE_KEY}`);
  const submitted = await asUser.mutation(submit, {
    problemCode: PROBLEM_CODE,
    languageKey: LANGUAGE_KEY,
    source,
  });
  info(`submission ${submitted.id} (${submitted.submissionId})`);

  step(`Waiting up to ${Math.round(TIMEOUT_MS / 1000)}s for a verdict`);
  const deadline = Date.now() + TIMEOUT_MS;
  let last = "";
  let detail = null;
  let done = false;
  while (Date.now() < deadline) {
    detail = await asUser.query(detailQuery, { submissionId: submitted.id });
    const submission = detail?.submission;
    if (submission) {
      const line = `${verdict(submission)} case ${submission.currentTestcase}`;
      if (line !== last) {
        info(`${DIM}${line}${RESET}`);
        last = line;
      }
      if (["D", "CE", "IE", "AB"].includes(submission.status)) {
        done = true;
        break;
      }
    }
    await sleep(POLL_MS);
  }

  const submission = detail?.submission;
  if (!submission) throw new Error("the submission vanished");

  if (detail.cases?.length) {
    step("Cases");
    for (const row of detail.cases) info(formatCase(row));
  }
  if (detail.error) {
    step("Judge output");
    info(String(detail.error).split("\n").join("\n    "));
  }

  const ok = submission.status === "D" && submission.result === "AC";
  process.stdout.write(
    `\n${ok ? GREEN : RED}${verdict(submission)}${RESET}` +
      ` ${submission.points ?? 0} points,` +
      ` ${submission.casePoints}/${submission.caseTotal} case points,` +
      ` ${(submission.time ?? 0).toFixed(3)}s,` +
      ` ${Math.round((submission.memory ?? 0) / 1024)}MB\n`,
  );

  if (!ok) {
    let hint = "";
    if (!done) hint = " — it never finished within the timeout";
    if (submission.status === "QU") {
      hint =
        " — no judge claimed it. Is the container running, does it have the same name and key," +
        " and does its /problems volume hold the problem?";
    }
    throw new Error(`expected D/AC, got ${verdict(submission)}${hint}`);
  }
  process.stdout.write(`\n${GREEN}judge end to end: ok${RESET}\n\n`);
}

main().catch((error) => {
  process.stderr.write(`\n${RED}e2e:judge failed:${RESET} ${error.message}\n`);
  process.exit(1);
});
