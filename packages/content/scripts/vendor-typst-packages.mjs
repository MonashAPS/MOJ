#!/usr/bin/env node

/**
 * Refreshes the vendored Typst packages under `typst/packages/preview`.
 *
 * The layout has to match Typst's own package directory
 * (`<root>/<namespace>/<name>/<version>`), because `renderPdf` points both
 * `TYPST_PACKAGE_PATH` and `TYPST_PACKAGE_CACHE_PATH` at it so a compile never has to reach
 * the network. The tarballs come from https://packages.typst.org.
 *
 *   node scripts/vendor-typst-packages.mjs                     # the pinned versions
 *   node scripts/vendor-typst-packages.mjs cmarker@0.1.11      # a specific one
 */

import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const PINNED = ["cmarker@0.1.10", "mitex@0.2.7"];

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "typst", "packages", "preview");

async function run(command, args, options = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(undefined);
      else reject(new Error(`${command} exited with ${code}`));
    });
  });
}

async function vendor(spec) {
  const [name, version] = spec.split("@");
  if (!name || !version) throw new Error(`expected name@version, got ${spec}`);

  const target = join(ROOT, name, version);
  const staging = await mkdtemp(join(tmpdir(), "moj-typst-pkg-"));
  const archive = join(staging, "package.tar.gz");
  const url = `https://packages.typst.org/preview/${name}-${version}.tar.gz`;

  process.stdout.write(`downloading ${url}\n`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status} ${response.statusText}`);
  await pipeline(response.body, createWriteStream(archive));

  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  await run("tar", ["-xzf", archive, "-C", target]);
  await rm(staging, { recursive: true, force: true });

  const files = await readdir(target);
  if (!files.includes("typst.toml")) throw new Error(`${spec}: no typst.toml in the archive`);
  process.stdout.write(`vendored ${spec} into ${target}\n`);
}

const specs = process.argv.slice(2);
for (const spec of specs.length > 0 ? specs : PINNED) await vendor(spec);
process.stdout.write('\nRemember to update the `#import "@preview/..."` lines in typst/statement.typ.\n');
