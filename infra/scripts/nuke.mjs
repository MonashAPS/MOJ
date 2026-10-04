#!/usr/bin/env node
/** Remove the development Compose project and this checkout's generated instance files. */
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

const GENERATED = [
  ".env.local",
  "apps/web/.env.local",
  "infra/problems/judge.yml",
  ".local/browser-test.json",
  ".convex-tmp",
  ".local/judge-problems",
  "apps/web/.next",
];

function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write("Usage: npm run nuke -- [--dry-run] [-p PROJECT] [-f OVERRIDE_FILE]\n");

    return;
  }

  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--dry-run") continue;

    if (
      !["-p", "--project-name", "-f", "--file"].includes(args[index]) ||
      !args[index + 1] ||
      args[index + 1].startsWith("-")
    ) {
      throw new Error(`Unsupported or incomplete option: ${args[index]}. Use --help for usage.`);
    }

    index++;
  }

  const dryRun = args.includes("--dry-run");

  process.stdout.write(
    `${dryRun ? "Previewing removal of" : "Permanently removing"} the local development databases, containers, judge images and generated instance files.\n`,
  );

  const result = spawnSync(
    "docker",
    [
      "compose",
      "-f",
      "infra/compose.dev.yml",
      "--project-directory",
      ".",
      "--profile",
      "*",
      ...args,
      "down",
      "--volumes",
      "--remove-orphans",
      "--rmi",
      "local",
    ],
    { cwd: ROOT, stdio: "inherit" },
  );

  if (result.error) throw result.error;

  if (result.status !== 0) {
    throw new Error("Docker cleanup failed; generated instance files have been kept.");
  }

  for (const path of GENERATED) {
    if (!dryRun) rmSync(join(ROOT, path), { recursive: true, force: true });
    process.stdout.write(`${dryRun ? "Would remove" : "Removed"} ${path}\n`);
  }

  process.stdout.write(
    dryRun
      ? "Dry run complete; no data was deleted.\n"
      : "Local development reset. Rebuild with npm run setup, then npm run setup:judge. Clear this site's browser cookies and local storage before signing in again.\n",
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(`nuke failed: ${error.message}\n`);
  process.exitCode = 1;
}
