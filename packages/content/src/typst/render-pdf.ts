/**
 * Compiles Typst source to a PDF by spawning the Typst binary.
 *
 * The binary comes from `TYPST_BIN` (`typst` on `PATH` otherwise), and the `cmarker` and
 * `mitex` packages are read from the vendored tree under `packages/content/typst/packages`,
 * which is laid out exactly like Typst's own package directory
 * (`<root>/<namespace>/<name>/<version>`). Both `TYPST_PACKAGE_PATH` and
 * `TYPST_PACKAGE_CACHE_PATH` point at it, so a compile never touches the network.
 */

import { spawn } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * `packages/content/typst`, whether this module is running from `src` or `dist`.
 *
 * `TYPST_TEMPLATE_DIR` overrides it for a deployment that copies the templates
 * somewhere else. The relative path is assembled rather than written as a
 * literal on purpose: a bundler treats `new URL("literal", import.meta.url)` as
 * an asset reference and tries to resolve the directory as a module, which is
 * what stopped `next build` from compiling the PDF route.
 */
const TEMPLATE_RELATIVE = ["..", "..", "typst", ""].join("/");

export const TYPST_TEMPLATE_DIR =
  process.env.TYPST_TEMPLATE_DIR || fileURLToPath(new URL(TEMPLATE_RELATIVE, import.meta.url));

/** The vendored `@preview` packages. */
export const DEFAULT_TYPST_PACKAGE_PATH = join(TYPST_TEMPLATE_DIR, "packages");

export const TEMPLATE_FILES = ["statement.typ", "booklet.typ"] as const;

export function typstBinary(): string {
  return process.env.TYPST_BIN || "typst";
}

export interface RenderPdfOptions {
  /** Directory to compile in. A temporary one is made and removed when omitted. */
  readonly workdir?: string;
  /**
   * Files to place in the workdir before compiling, keyed by path relative to it. A string
   * value is read as a path to copy from; bytes are written as-is.
   */
  readonly assets?: Readonly<Record<string, Uint8Array | string>>;
  /** Copy `statement.typ` and `booklet.typ` in. On by default. */
  readonly templates?: boolean;
  readonly packagePath?: string;
  readonly bin?: string;
  /** File name for the source inside the workdir. */
  readonly entry?: string;
  readonly fontPaths?: readonly string[];
  readonly timeoutMs?: number;
  /** Keep a temporary workdir behind for debugging. */
  readonly keep?: boolean;
  readonly env?: Readonly<Record<string, string>>;
}

export class TypstCompileError extends Error {
  readonly stderr: string;
  readonly stdout: string;
  readonly code: number | null;

  constructor(message: string, options: { stderr: string; stdout: string; code: number | null }) {
    super(message);
    this.name = "TypstCompileError";
    this.stderr = options.stderr;
    this.stdout = options.stdout;
    this.code = options.code;
  }
}

function assertInside(root: string, target: string): string {
  const full = resolve(root, target);
  const prefix = root.endsWith(sep) ? root : root + sep;

  if (!full.startsWith(prefix)) {
    throw new Error(`asset path escapes the work directory: ${target}`);
  }

  return full;
}

async function writeAssets(
  workdir: string,
  assets: Readonly<Record<string, Uint8Array | string>>,
): Promise<void> {
  for (const [name, value] of Object.entries(assets)) {
    if (isAbsolute(name) && normalize(name) !== name) {
      throw new Error(`asset path must be relative: ${name}`);
    }

    const target = assertInside(workdir, name.replace(/^[/\\]+/, ""));
    await mkdir(dirname(target), { recursive: true });

    if (value instanceof Uint8Array) await writeFile(target, value);
    else await copyFile(value, target);
  }
}

interface SpawnResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function run(
  bin: string,
  args: readonly string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number },
): Promise<SpawnResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(bin, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, options.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      rejectPromise(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);

      if (timedOut) {
        rejectPromise(new Error(`typst timed out after ${options.timeoutMs} ms`));

        return;
      }

      resolvePromise({ code, stdout, stderr });
    });
  });
}

/** True when a Typst binary is reachable, so tests can skip cleanly. */
export async function typstAvailable(bin = typstBinary()): Promise<boolean> {
  try {
    const result = await run(bin, ["--version"], {
      cwd: process.cwd(),
      env: process.env,
      timeoutMs: 10_000,
    });

    return result.code === 0;
  } catch {
    return false;
  }
}

export async function renderPdf(typstSource: string, options: RenderPdfOptions = {}): Promise<Buffer> {
  const bin = options.bin ?? typstBinary();
  const packagePath = options.packagePath ?? DEFAULT_TYPST_PACKAGE_PATH;
  const entry = options.entry ?? "main.typ";
  const timeoutMs = options.timeoutMs ?? 120_000;

  const temporary = options.workdir === undefined;

  const workdir =
    options.workdir === undefined ? await mkdtemp(join(tmpdir(), "moj-typst-")) : resolve(options.workdir);

  if (!temporary) await mkdir(workdir, { recursive: true });

  try {
    if (options.templates !== false) {
      for (const file of TEMPLATE_FILES) {
        await copyFile(join(TYPST_TEMPLATE_DIR, file), join(workdir, file));
      }
    }

    if (options.assets) await writeAssets(workdir, options.assets);

    const entryPath = assertInside(workdir, entry);
    await mkdir(dirname(entryPath), { recursive: true });
    await writeFile(entryPath, typstSource, "utf8");

    const output = join(workdir, "out.pdf");
    const args = ["compile", "--root", workdir];

    for (const fontPath of options.fontPaths ?? []) args.push("--font-path", fontPath);
    args.push(entryPath, output);

    const result = await run(bin, args, {
      cwd: workdir,
      env: {
        ...process.env,
        ...options.env,
        TYPST_PACKAGE_PATH: packagePath,
        TYPST_PACKAGE_CACHE_PATH: packagePath,
      },
      timeoutMs,
    });

    if (result.code !== 0) {
      throw new TypstCompileError(`typst exited with code ${result.code}`, {
        stderr: result.stderr,
        stdout: result.stdout,
        code: result.code,
      });
    }

    return await readFile(output);
  } finally {
    if (temporary && !options.keep) await rm(workdir, { recursive: true, force: true });
  }
}
