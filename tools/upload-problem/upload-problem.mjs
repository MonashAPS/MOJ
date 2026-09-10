#!/usr/bin/env node
/**
 * Upload problems from a problem repository to a MOJ judge.
 *
 * One PUT per problem and one POST per statement image against the problems API
 * (SPEC section 8), so publishing a statement never needs a browser or a login.
 *
 * No dependencies: plain `node upload-problem.mjs` on Node 24.
 *
 * Usage:
 *   node upload-problem.mjs --problem-dir problems/aplusb [--problem-dir ...]
 *   node upload-problem.mjs --problems-root problems --changed "<paths>"
 *   node upload-problem.mjs --problems-root problems            (every problem)
 *
 * Options:
 *   --problem-dir <dir>     a problem directory; repeatable
 *   --problems-root <dir>   the directory problem directories live in
 *   --changed <list>        newline or comma separated changed paths; only the
 *                           problem directories they touch are uploaded
 *   --include <glob>        keep only problem codes matching; repeatable
 *   --exclude <glob>        drop problem codes matching; repeatable
 *   --registry <path>       image cache file (default <root>/.image-registry.json)
 *   --statement-only        send the statement and editorial, nothing else
 *   --dry-run               resolve and report, send nothing
 *   --json                  print a machine readable summary on the last line
 *   --judge-url <url>       overrides JUDGE_URL
 *   --api-key <key>         overrides JUDGE_API_KEY
 *   -h, --help
 *
 * Environment:
 *   JUDGE_URL      the judge's address, e.g. https://judge.example.org
 *   JUDGE_API_KEY  an API key with the problems:write scope
 *
 * See README.md beside this file.
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const MARKDOWN_IMAGE_PATTERN = /!\[([^\]]*)\]\((?!https?:\/\/)(?!data:)(?!\/)([^)\s]+)([^)]*)\)/g;
const HTML_IMAGE_PATTERN = /<img\b[^>]*\bsrc=["'](?!https?:\/\/)(?!data:)(?!\/)([^"']+)["'][^>]*>/gi;

/** What a problem gets when `config.json` says nothing, so a repository can
 *  carry a statement and no metadata at all. */
export const DEFAULTS = {
  points: 100,
  timeLimit: 1,
  memoryLimit: 1_000_000,
  shortCircuit: true,
};

/** Repositories in the wild spell it `statment.md`; both names are read. */
const STATEMENT_NAMES = ["statement.md", "statment.md"];
const EDITORIAL_NAMES = ["editorial.md"];

export class UploadError extends Error {}

/* -------------------------------------------------------------------------- */
/* Arguments                                                                  */
/* -------------------------------------------------------------------------- */

export function parseArgs(argv) {
  const args = {
    problemDirs: [],
    problemsRoot: "",
    changed: "",
    include: [],
    exclude: [],
    registry: "",
    statementOnly: false,
    dryRun: false,
    json: false,
    judgeUrl: "",
    apiKey: "",
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    const needsValue = () => {
      if (value === undefined || value.startsWith("--")) {
        throw new UploadError(`${flag} needs a value`);
      }
      i += 1;
      return value;
    };

    switch (flag) {
      case "--problem-dir":
        args.problemDirs.push(needsValue());
        break;
      case "--problems-root":
        args.problemsRoot = needsValue();
        break;
      case "--changed":
        args.changed = needsValue();
        break;
      case "--include":
        args.include.push(needsValue());
        break;
      case "--exclude":
        args.exclude.push(needsValue());
        break;
      case "--registry":
        args.registry = needsValue();
        break;
      case "--judge-url":
        args.judgeUrl = needsValue();
        break;
      case "--api-key":
        args.apiKey = needsValue();
        break;
      case "--statement-only":
        args.statementOnly = true;
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--json":
        args.json = true;
        break;
      case "-h":
      case "--help":
        args.help = true;
        break;
      default:
        throw new UploadError(`Unknown option: ${flag}`);
    }
  }

  if (args.problemDirs.length === 0 && !args.problemsRoot) {
    throw new UploadError("Pass --problem-dir <dir> or --problems-root <dir>.");
  }
  return args;
}

/** A tiny glob: `*` within a segment, `**` across segments, `?` one character. */
export function globToRegExp(pattern) {
  let out = "";
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === "*") {
      if (pattern[i + 1] === "*") {
        out += ".*";
        i += 1;
        if (pattern[i + 1] === "/") i += 1;
      } else {
        out += "[^/]*";
      }
    } else if (char === "?") {
      out += "[^/]";
    } else if ("\\^$.|+()[]{}".includes(char)) {
      out += `\\${char}`;
    } else {
      out += char;
    }
  }
  return new RegExp(`^${out}$`);
}

export function matchesAny(value, patterns) {
  return patterns.some((pattern) => globToRegExp(pattern).test(value));
}

/* -------------------------------------------------------------------------- */
/* Discovery                                                                  */
/* -------------------------------------------------------------------------- */

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function isProblemDir(dir) {
  if (await exists(path.join(dir, "config.json"))) return true;
  for (const name of STATEMENT_NAMES) {
    if (await exists(path.join(dir, name))) return true;
  }
  return false;
}

/**
 * The changed-paths list, mapped onto the problem directories it touches.
 *
 * The paths come from `git diff --name-only`, so they are repository relative,
 * while `--problems-root` may be absolute. The root's own last segment is
 * matched when the full prefix does not line up. A path must name a file
 * *inside* a problem directory, so `problems/README.md` selects nothing.
 */
export function problemCodesFromChanged(changed, problemsRoot) {
  const rootParts = String(problemsRoot).split(/[\\/]/).filter(Boolean);
  const rootName = rootParts.at(-1);
  const codes = new Set();

  for (const raw of String(changed).split(/[\n,]/)) {
    const entry = raw.trim().replace(/^["']|["']$/g, "");
    if (!entry) continue;
    const parts = entry.split(/[\\/]/).filter(Boolean);

    let start = -1;
    if (rootParts.length > 0 && rootParts.every((part, index) => parts[index] === part)) {
      start = rootParts.length;
    } else if (rootName) {
      const index = parts.lastIndexOf(rootName);
      if (index >= 0) start = index + 1;
    } else if (parts.length > 1) {
      start = 0;
    }

    if (start < 0 || parts.length < start + 2) continue;
    const code = parts[start];
    if (code) codes.add(code);
  }
  return [...codes];
}

export async function resolveProblemDirs(args) {
  const dirs = [];
  for (const dir of args.problemDirs) dirs.push(path.resolve(dir));

  if (args.problemsRoot) {
    const root = path.resolve(args.problemsRoot);
    if (args.changed) {
      for (const code of problemCodesFromChanged(args.changed, args.problemsRoot)) {
        const candidate = path.join(root, code);
        if (await isProblemDir(candidate)) dirs.push(candidate);
      }
    } else {
      const entries = await fs.readdir(root, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
        const candidate = path.join(root, entry.name);
        if (await isProblemDir(candidate)) dirs.push(candidate);
      }
    }
  }

  const unique = [...new Set(dirs)].sort();
  return unique.filter((dir) => {
    const code = problemCodeFromDir(dir);
    if (args.include.length > 0 && !matchesAny(code, args.include)) return false;
    if (args.exclude.length > 0 && matchesAny(code, args.exclude)) return false;
    return true;
  });
}

export function problemCodeFromDir(dir) {
  return path.basename(dir).trim().toLowerCase();
}

/* -------------------------------------------------------------------------- */
/* Config                                                                     */
/* -------------------------------------------------------------------------- */

function positiveNumber(raw, field) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new UploadError(`Invalid ${field}: ${JSON.stringify(raw)}`);
  }
  return value;
}

function boolean(raw, field) {
  if (typeof raw === "boolean") return raw;
  const text = String(raw).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(text)) return true;
  if (["0", "false", "no", "off"].includes(text)) return false;
  throw new UploadError(`Invalid ${field}: ${JSON.stringify(raw)}`);
}

function nameList(raw) {
  if (Array.isArray(raw)) return raw.map((entry) => String(entry).trim()).filter(Boolean);
  if (raw === undefined || raw === null) return [];
  return String(raw)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function readFirst(dir, names) {
  for (const name of names) {
    const target = path.join(dir, name);
    if (await exists(target)) return { name, content: await fs.readFile(target, "utf8") };
  }
  return null;
}

/**
 * config.json, statement.md and editorial.md, turned into the request body.
 *
 * Absent keys stay absent so the API leaves them alone; that is exactly what
 * create-problem.mjs's `*Provided` flags did on the admin form.
 */
export async function buildRequest(problemDir, { statementOnly = false } = {}) {
  const dir = path.resolve(problemDir);
  const code = problemCodeFromDir(dir);

  const statement = await readFirst(dir, STATEMENT_NAMES);
  if (!statement) {
    throw new UploadError(`Missing statement file: ${path.join(dir, STATEMENT_NAMES[0])}`);
  }
  const editorial = await readFirst(dir, EDITORIAL_NAMES);

  const body = { statement: statement.content };
  if (editorial?.content.trim()) {
    body.editorial = { content: editorial.content, isPublic: true };
  }

  const configPath = path.join(dir, "config.json");
  let config = {};
  const hasConfig = await exists(configPath);
  if (hasConfig) {
    const raw = await fs.readFile(configPath, "utf8");
    try {
      config = JSON.parse(raw);
    } catch (error) {
      throw new UploadError(`Invalid JSON in ${configPath}: ${error.message}`);
    }
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      throw new UploadError(`Expected a JSON object in ${configPath}`);
    }
  }
  const has = (field) => Object.hasOwn(config, field);

  if (statementOnly) {
    // The old `update-markdown` mode: text only, everything else untouched.
    return { code, dir, body, statementFile: statement.name, warnings: [] };
  }

  const warnings = [];
  if (has("title")) {
    const title = String(config.title ?? "").trim();
    if (!title) throw new UploadError("config.title is empty");
    body.name = title;
  }
  if (has("authors")) {
    // SPEC section 8: an empty list means "unchanged", so it is not sent.
    const authors = nameList(config.authors);
    if (authors.length > 0) body.authors = authors;
  }
  if (has("testers")) {
    const testers = nameList(config.testers);
    if (testers.length > 0) body.testers = testers;
  }
  if (has("points")) body.points = positiveNumber(config.points, "config.points");
  if (has("timeLimit")) body.timeLimit = positiveNumber(config.timeLimit, "config.timeLimit");
  if (has("memoryLimit")) {
    body.memoryLimit = positiveNumber(config.memoryLimit, "config.memoryLimit");
  }
  if (has("shortCircuit")) body.shortCircuit = boolean(config.shortCircuit, "config.shortCircuit");
  if (has("partial")) body.partial = boolean(config.partial, "config.partial");
  if (has("public")) body.isPublic = boolean(config.public, "config.public");
  if (has("summary")) body.summary = String(config.summary);

  // create-problem.mjs wrote the python3 and pypy3 rows whenever a time limit
  // was being applied, with pythonTimeLimit falling back to the global one.
  const wantsLimits = has("pythonTimeLimit") || has("timeLimit") || has("memoryLimit");
  if (wantsLimits) {
    const timeLimit = has("pythonTimeLimit")
      ? positiveNumber(config.pythonTimeLimit, "config.pythonTimeLimit")
      : (body.timeLimit ?? DEFAULTS.timeLimit);
    const memoryLimit = body.memoryLimit ?? DEFAULTS.memoryLimit;
    body.languageLimits = {
      python3: { timeLimit, memoryLimit },
      pypy3: { timeLimit, memoryLimit },
    };
  }

  if (!hasConfig) warnings.push(`${code}: no config.json, sending the statement only`);

  return { code, dir, body, statementFile: statement.name, warnings };
}

/* -------------------------------------------------------------------------- */
/* HTTP                                                                       */
/* -------------------------------------------------------------------------- */

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export function createClient({ judgeUrl, apiKey, fetchImpl = globalThis.fetch }) {
  const base = String(judgeUrl || "").replace(/\/+$/, "");
  if (!base) throw new UploadError("JUDGE_URL is not set.");
  if (!apiKey) throw new UploadError("JUDGE_API_KEY is not set.");

  const authorization = `Bearer ${apiKey}`;

  const describe = async (response) => {
    let detail = "";
    try {
      const body = await response.json();
      detail = body?.error?.message ? ` ${body.error.message}` : ` ${JSON.stringify(body)}`;
    } catch {
      detail = "";
    }
    return `HTTP ${response.status}${detail}`;
  };

  return {
    base,
    async putProblem(code, body) {
      const response = await fetchImpl(`${base}/api/problems/${code}`, {
        method: "PUT",
        headers: { authorization, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new UploadError(`${code}: ${await describe(response)}`);
      return await response.json();
    },
    async uploadImage(code, fileName, buffer, contentType) {
      const form = new FormData();
      form.append("file", new Blob([buffer], { type: contentType || "application/octet-stream" }), fileName);
      const response = await fetchImpl(`${base}/api/problems/${code}/images`, {
        method: "POST",
        headers: { authorization },
        body: form,
      });
      if (!response.ok) {
        throw new UploadError(`${code}: image ${fileName}: ${await describe(response)}`);
      }
      const payload = await response.json();
      if (payload.status !== 200 || !payload.link) {
        throw new UploadError(`${code}: image ${fileName} rejected: ${JSON.stringify(payload)}`);
      }
      return payload.link;
    },
  };
}

const CONTENT_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
};

/* -------------------------------------------------------------------------- */
/* Images                                                                     */
/* -------------------------------------------------------------------------- */

export function collectLocalImageRefs(markdown) {
  const refs = [];
  for (const match of markdown.matchAll(MARKDOWN_IMAGE_PATTERN)) {
    refs.push({
      fullMatch: match[0],
      localPath: match[2],
      replaceWith: (link) => `![${match[1]}](${link}${match[3] ?? ""})`,
    });
  }
  for (const match of markdown.matchAll(HTML_IMAGE_PATTERN)) {
    refs.push({
      fullMatch: match[0],
      localPath: match[1],
      replaceWith: (link) => match[0].replace(match[1], link),
    });
  }
  return refs;
}

async function loadRegistry(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return {};
  }
}

async function saveRegistry(file, registry) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(registry, null, 2)}\n`);
}

/**
 * Rewrite every local image reference to the link the judge gave back, keeping
 * a sha256-keyed cache so unchanged images are never re-uploaded.
 */
export async function rewriteImages(markdown, { code, dir, client, registry, registryDir, log }) {
  const refs = collectLocalImageRefs(markdown);
  if (refs.length === 0) return { markdown, uploaded: 0, cached: 0, dirty: false };

  let result = markdown;
  let uploaded = 0;
  let cached = 0;
  let dirty = false;

  for (const ref of refs) {
    const imagePath = path.resolve(dir, decodeURIComponent(ref.localPath));
    if (!(await exists(imagePath))) {
      log(`  warning: image not found at ${imagePath}, leaving the reference alone`);
      continue;
    }
    const buffer = await fs.readFile(imagePath);
    const hash = sha256(buffer);
    const key = path.relative(registryDir, imagePath).split(path.sep).join("/");
    const entry = registry[key];

    let link;
    if (entry && entry.hash === hash) {
      link = entry.link;
      cached += 1;
    } else {
      const extension = path.extname(imagePath).toLowerCase();
      link = await client.uploadImage(code, path.basename(imagePath), buffer, CONTENT_TYPES[extension]);
      registry[key] = { hash, link };
      dirty = true;
      uploaded += 1;
      log(`  uploaded ${key} -> ${link}`);
    }
    result = result.split(ref.fullMatch).join(ref.replaceWith(link));
  }

  return { markdown: result, uploaded, cached, dirty };
}

/* -------------------------------------------------------------------------- */
/* Run                                                                        */
/* -------------------------------------------------------------------------- */

export async function run(argv, options = {}) {
  const log = options.log ?? ((line) => process.stdout.write(`${line}\n`));
  const errorLog = options.errorLog ?? ((line) => process.stderr.write(`${line}\n`));
  const env = options.env ?? process.env;

  const args = parseArgs(argv);
  if (args.help) {
    log(HELP);
    return { uploaded: [], skipped: [], failed: [], exitCode: 0 };
  }

  const dirs = await resolveProblemDirs(args);
  if (dirs.length === 0) {
    log("No problems selected.");
    return { uploaded: [], skipped: [], failed: [], exitCode: 0 };
  }

  const registryFile = path.resolve(
    args.registry ||
      path.join(
        args.problemsRoot ? path.resolve(args.problemsRoot) : path.dirname(dirs[0]),
        ".image-registry.json",
      ),
  );
  const registryDir = path.dirname(registryFile);
  const registry = await loadRegistry(registryFile);
  let registryDirty = false;

  let client = null;
  if (!args.dryRun) {
    client =
      options.client ??
      createClient({
        judgeUrl: args.judgeUrl || env.JUDGE_URL,
        apiKey: args.apiKey || env.JUDGE_API_KEY,
        fetchImpl: options.fetchImpl,
      });
  }

  const uploaded = [];
  const skipped = [];
  const failed = [];

  for (const dir of dirs) {
    const code = problemCodeFromDir(dir);
    try {
      const request = await buildRequest(dir, { statementOnly: args.statementOnly });
      for (const warning of request.warnings) log(`  ${warning}`);

      if (args.dryRun) {
        const fields = Object.keys(request.body).sort().join(", ");
        log(`${code}: would upload (${fields})`);
        skipped.push({ code, reason: "dry-run" });
        continue;
      }

      const statement = await rewriteImages(request.body.statement, {
        code,
        dir,
        client,
        registry,
        registryDir,
        log,
      });
      registryDirty ||= statement.dirty;
      request.body.statement = statement.markdown;

      if (request.body.editorial) {
        const rewritten = await rewriteImages(request.body.editorial.content, {
          code,
          dir,
          client,
          registry,
          registryDir,
          log,
        });
        registryDirty ||= rewritten.dirty;
        request.body.editorial.content = rewritten.markdown;
      }

      const response = await client.putProblem(code, request.body);
      const verb = response.created ? "created" : "updated";
      log(`${code}: ${verb} "${response.problem?.name ?? code}"`);
      for (const warning of response.warnings ?? []) log(`  warning: ${warning}`);
      uploaded.push({ code, created: !!response.created, name: response.problem?.name ?? code });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errorLog(`${code}: FAILED ${message}`);
      failed.push({ code, error: message });
    }
  }

  if (registryDirty) await saveRegistry(registryFile, registry);

  log("");
  log(`${uploaded.length} uploaded, ${skipped.length} skipped, ${failed.length} failed.`);
  const result = { uploaded, skipped, failed, exitCode: failed.length > 0 ? 1 : 0 };
  if (args.json) log(JSON.stringify(result));
  return result;
}

const HELP = `Upload problems from a problem repository to MOJ.

  --problem-dir <dir>     a problem directory; repeatable
  --problems-root <dir>   the directory problem directories live in
  --changed <list>        newline or comma separated changed paths
  --include <glob>        keep only problem codes matching; repeatable
  --exclude <glob>        drop problem codes matching; repeatable
  --registry <path>       image cache file (default <root>/.image-registry.json)
  --statement-only        send the statement and editorial, nothing else
  --dry-run               resolve and report, send nothing
  --json                  print a machine readable summary on the last line
  --judge-url <url>       overrides JUDGE_URL
  --api-key <key>         overrides JUDGE_API_KEY

Environment:
  JUDGE_URL      the judge's address, e.g. https://judge.example.org
  JUDGE_API_KEY  an API key with the problems:write scope`;

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (invokedDirectly) {
  try {
    const result = await run(process.argv.slice(2));
    process.exit(result.exitCode);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(2);
  }
}
