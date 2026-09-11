#!/usr/bin/env node
/**
 * Upload problems from a problem repository to a MOJ site.
 *
 * Three things per problem: the statement and metadata over `PUT
 * /api/problems/<code>`, any statement image over the images endpoint, and the
 * test data as one deterministic zip over the data endpoints. Publishing never
 * needs a browser, a login or an SSH key: a URL and an API key are the whole of
 * it.
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
 *   --skip-data             do not publish the test data
 *   --data-only             publish the test data and nothing else
 *   --statement-only        send the statement and editorial, nothing else
 *   --dry-run               resolve and report, send nothing
 *   --json                  print a machine readable summary on the last line
 *   --judge-url <url>       overrides JUDGE_URL
 *   --api-key <key>         overrides JUDGE_API_KEY
 *   -h, --help
 *
 * Environment:
 *   JUDGE_URL      the site's address, e.g. https://judge.example.org
 *   JUDGE_API_KEY  an API key with the problems:write scope
 *
 * See README.md beside this file.
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";

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
    skipData: false,
    dataOnly: false,
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
      case "--skip-data":
        args.skipData = true;
        break;
      case "--data-only":
        args.dataOnly = true;
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
  if (args.dataOnly && args.skipData) {
    throw new UploadError("--data-only and --skip-data contradict each other.");
  }
  if (args.dataOnly && args.statementOnly) {
    throw new UploadError("--data-only and --statement-only contradict each other.");
  }
  return args;
}

/** What a run publishes, once the three mode flags have been read. */
export function publishPlan(args) {
  return {
    statement: !args.dataOnly,
    data: args.dataOnly || !(args.skipData || args.statementOnly),
  };
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
/* Test data archive                                                          */
/* -------------------------------------------------------------------------- */

/** Files at the top of a problem directory that belong to the statement half. */
const DATA_EXCLUDED_ROOT_FILES = new Set([...STATEMENT_NAMES, ...EDITORIAL_NAMES, "config.json"]);
/** Directories skipped wherever they appear. Dotted names are skipped as well. */
const DATA_EXCLUDED_DIRS = new Set(["__pycache__"]);

/** Zip without zip64: no member, and no archive, may reach 4 GiB. */
const ZIP_MAX_BYTES = 0xffffffff;
const ZIP_MAX_ENTRIES = 0xffff;
/** 1980-01-01 00:00:00, the oldest moment a DOS timestamp can name. */
const ZIP_DOS_DATE = 0x0021;
const ZIP_DOS_TIME = 0x0000;
/** Spelled out rather than left to the defaults, because the bytes are hashed. */
const DEFLATE_OPTIONS = {
  level: 6,
  memLevel: 8,
  strategy: zlib.constants.Z_DEFAULT_STRATEGY,
  windowBits: 15,
};

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

export function crc32(buffer) {
  let crc = 0xffffffff;
  for (let index = 0; index < buffer.length; index++) {
    crc = CRC_TABLE[(crc ^ buffer[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/**
 * Every file in the problem directory that is test data, in archive order.
 *
 * Test data is "everything else": `init.yml` and whatever it names, which is
 * checkers, graders, generators and the cases themselves. The statement half
 * (`statement.md`, `editorial.md`, `config.json`) is left out, and so are
 * dotfiles, `__pycache__` and anything that is neither a file nor a directory.
 * Order is the byte order of the archive paths, so the listing does not depend
 * on the order the filesystem happens to hand entries back.
 */
export async function collectDataFiles(problemDir, { log = () => {} } = {}) {
  const root = path.resolve(problemDir);
  const files = [];
  const visited = new Set();

  const walk = async (current, prefix) => {
    const real = await fs.realpath(current);
    if (visited.has(real)) return;
    visited.add(real);

    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (DATA_EXCLUDED_DIRS.has(entry.name)) continue;
      if (!prefix && DATA_EXCLUDED_ROOT_FILES.has(entry.name)) continue;

      const absolute = path.join(current, entry.name);
      const archivePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      let stats;
      try {
        stats = await fs.stat(absolute);
      } catch {
        log(`  warning: ${archivePath} does not resolve, leaving it out of the archive`);
        continue;
      }

      if (stats.isDirectory()) {
        await walk(absolute, archivePath);
      } else if (stats.isFile()) {
        files.push({
          absolute,
          archivePath,
          size: stats.size,
          executable: (stats.mode & 0o111) !== 0,
        });
      } else {
        log(`  warning: ${archivePath} is not a regular file, leaving it out of the archive`);
      }
    }
  };

  await walk(root, "");
  files.sort((a, b) =>
    Buffer.compare(Buffer.from(a.archivePath, "utf8"), Buffer.from(b.archivePath, "utf8")),
  );
  return files;
}

function localHeader(entry) {
  const header = Buffer.alloc(30 + entry.name.length);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4); // the version that understands deflate
  header.writeUInt16LE(0x0800, 6); // names are UTF-8
  header.writeUInt16LE(entry.method, 8);
  header.writeUInt16LE(ZIP_DOS_TIME, 10);
  header.writeUInt16LE(ZIP_DOS_DATE, 12);
  header.writeUInt32LE(entry.crc, 14);
  header.writeUInt32LE(entry.compressedSize, 18);
  header.writeUInt32LE(entry.uncompressedSize, 22);
  header.writeUInt16LE(entry.name.length, 26);
  header.writeUInt16LE(0, 28); // no extra field, so no timestamps sneak back in
  entry.name.copy(header, 30);
  return header;
}

function centralHeader(entry) {
  const header = Buffer.alloc(46 + entry.name.length);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(0x031e, 4); // made by Unix, version 3.0, so the mode is read
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0x0800, 8);
  header.writeUInt16LE(entry.method, 10);
  header.writeUInt16LE(ZIP_DOS_TIME, 12);
  header.writeUInt16LE(ZIP_DOS_DATE, 14);
  header.writeUInt32LE(entry.crc, 16);
  header.writeUInt32LE(entry.compressedSize, 20);
  header.writeUInt32LE(entry.uncompressedSize, 24);
  header.writeUInt16LE(entry.name.length, 28);
  header.writeUInt16LE(0, 30); // no extra field
  header.writeUInt16LE(0, 32); // no comment
  header.writeUInt16LE(0, 34); // one disk
  header.writeUInt16LE(0, 36); // no internal attributes
  header.writeUInt32LE(entry.externalAttributes, 38);
  header.writeUInt32LE(entry.offset, 42);
  entry.name.copy(header, 46);
  return header;
}

function endOfCentralDirectory(count, size, offset) {
  const record = Buffer.alloc(22);
  record.writeUInt32LE(0x06054b50, 0);
  record.writeUInt16LE(0, 4);
  record.writeUInt16LE(0, 6);
  record.writeUInt16LE(count, 8);
  record.writeUInt16LE(count, 10);
  record.writeUInt32LE(size, 12);
  record.writeUInt32LE(offset, 16);
  record.writeUInt16LE(0, 20); // no archive comment
  return record;
}

/**
 * The problem's test data as one zip, built so that identical inputs give
 * identical bytes and therefore an identical hash.
 *
 * Everything that could vary between two checkouts of the same commit is
 * pinned: entries are sorted by path, every timestamp is the DOS epoch, the
 * deflate settings are written out rather than inherited, paths use forward
 * slashes, and no extra fields are emitted. The only thing the file system
 * contributes besides the bytes is the executable bit, which git tracks, so a
 * fresh clone hashes the same as the machine the data was written on.
 *
 * Node has no zip writer, and pulling one in would cost this script its "no
 * dependencies" property, so this is a store-or-deflate writer over `node:zlib`.
 * It writes no zip64 records, which is why a member of 4 GiB or more is refused
 * rather than silently truncated.
 */
export async function buildDataArchive(problemDir, options = {}) {
  const files = await collectDataFiles(problemDir, options);
  if (files.length > ZIP_MAX_ENTRIES) {
    throw new UploadError(
      `${files.length} files is more than the ${ZIP_MAX_ENTRIES} a zip without zip64 can hold. ` +
        "Pack the cases into a zip named by init.yml's `archive` key, which counts as one file here.",
    );
  }

  const parts = [];
  const central = [];
  let offset = 0;
  let uncompressed = 0;

  for (const file of files) {
    // Checked before the read, so a file too big for the format is refused
    // rather than pulled into memory first.
    if (file.size >= ZIP_MAX_BYTES) {
      throw new UploadError(
        `${file.archivePath} is ${formatBytes(file.size)}; a zip without zip64 cannot hold a file ` +
          "of 4 GB or more. Split the data, or distribute it to the judges yourself.",
      );
    }

    const contents = await fs.readFile(file.absolute);
    const deflated = zlib.deflateRawSync(contents, DEFLATE_OPTIONS);
    const useDeflate = deflated.length < contents.length;
    const payload = useDeflate ? deflated : contents;
    const entry = {
      name: Buffer.from(file.archivePath, "utf8"),
      method: useDeflate ? 8 : 0,
      crc: crc32(contents),
      compressedSize: payload.length,
      uncompressedSize: contents.length,
      externalAttributes: ((file.executable ? 0o100755 : 0o100644) << 16) >>> 0,
      offset,
    };

    const header = localHeader(entry);
    parts.push(header, payload);
    central.push(centralHeader(entry));
    offset += header.length + payload.length;
    uncompressed += contents.length;

    if (offset >= ZIP_MAX_BYTES) {
      throw new UploadError(
        `The archive passed 4 GB at ${file.archivePath}; a zip without zip64 cannot go that far. ` +
          "Split the problem's data, or distribute it to the judges yourself.",
      );
    }
  }

  const centralSize = central.reduce((total, header) => total + header.length, 0);
  if (offset + centralSize >= ZIP_MAX_BYTES) {
    throw new UploadError("The archive passed 4 GB; a zip without zip64 cannot go that far.");
  }

  const bytes = Buffer.concat([
    ...parts,
    ...central,
    endOfCentralDirectory(files.length, centralSize, offset),
  ]);
  return {
    bytes,
    hash: sha256(bytes),
    size: bytes.length,
    fileCount: files.length,
    uncompressedSize: uncompressed,
    paths: files.map((file) => file.archivePath),
  };
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
    /** What the site holds for this problem, so unchanged data is not re-sent. */
    async getData(code) {
      const response = await fetchImpl(`${base}/api/problems/${code}/data`, {
        headers: { authorization },
      });
      if (response.status === 404) return { exists: false, hash: null };
      if (!response.ok) throw new UploadError(`${code}: data: ${await describe(response)}`);
      const payload = await response.json();
      return {
        exists: true,
        hash: payload.hash ?? null,
        size: payload.size ?? 0,
        fileCount: payload.fileCount ?? 0,
        uploadedAt: payload.uploadedAt ?? null,
      };
    },
    /** The archive goes to storage directly, so its size is not an HTTP body limit. */
    async uploadData(code, bytes) {
      const urlResponse = await fetchImpl(`${base}/api/problems/${code}/data/upload-url`, {
        method: "POST",
        headers: { authorization },
      });
      if (!urlResponse.ok) {
        throw new UploadError(`${code}: data upload URL: ${await describe(urlResponse)}`);
      }
      const { uploadUrl } = await urlResponse.json();
      if (!uploadUrl) throw new UploadError(`${code}: the site returned no upload URL for the data.`);

      const send = (method) =>
        fetchImpl(uploadUrl, { method, headers: { "content-type": "application/zip" }, body: bytes });
      // Storage backends differ on which write verb they take; try both rather
      // than make the caller care.
      let response = await send("PUT");
      if (response.status === 405 || response.status === 501) response = await send("POST");
      if (!response.ok) throw new UploadError(`${code}: data upload: ${await describe(response)}`);

      const payload = await response.json();
      if (!payload.storageId) {
        throw new UploadError(`${code}: the data upload returned no storage id: ${JSON.stringify(payload)}`);
      }
      return payload.storageId;
    },
    async recordData(code, body) {
      const response = await fetchImpl(`${base}/api/problems/${code}/data`, {
        method: "POST",
        headers: { authorization, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new UploadError(`${code}: data: ${await describe(response)}`);
      return await response.json();
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

function describeArchive(archive) {
  const files = `${archive.fileCount} ${archive.fileCount === 1 ? "file" : "files"}`;
  return `${files}, ${formatBytes(archive.size)}, sha256 ${archive.hash.slice(0, 12)}`;
}

/**
 * The archive for one problem, or null when the directory carries no data.
 *
 * A problem directory with no `init.yml` is a statement-only problem, and
 * publishing an archive for it would tell every judge to grade from data that
 * is not there, so it is left alone unless the run asked for data and nothing
 * else.
 */
async function prepareArchive(dir, code, { log, dataOnly }) {
  const archive = await buildDataArchive(dir, { log });
  if (archive.paths.includes("init.yml")) return archive;

  const reason =
    archive.fileCount === 0 ? "the directory holds no test data" : "the directory has no init.yml";
  if (dataOnly) throw new UploadError(`${code}: ${reason}, so there is no test data to publish.`);
  log(`  data: not published, ${reason}`);
  return null;
}

/** Ask, then upload only if the site's copy is not already these bytes. */
async function publishArchive(code, archive, client, log) {
  const current = await client.getData(code);
  if (!current.exists) {
    throw new UploadError(
      `${code}: the site has no such problem, so its test data has nowhere to go. Publish the statement first.`,
    );
  }

  const summary = describeArchive(archive);
  const result = { hash: archive.hash, size: archive.size, fileCount: archive.fileCount };
  if (current.hash === archive.hash) {
    log(`  data: unchanged (${summary})`);
    return { ...result, status: "unchanged" };
  }

  const storageId = await client.uploadData(code, archive.bytes);
  const response = await client.recordData(code, { storageId, ...result });
  const status = response.changed === false ? "unchanged" : "published";
  log(`  data: ${status} (${summary})`);
  return { ...result, status };
}

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

  const plan = publishPlan(args);
  const makeClient = () =>
    options.client ??
    createClient({
      judgeUrl: args.judgeUrl || env.JUDGE_URL,
      apiKey: args.apiKey || env.JUDGE_API_KEY,
      fetchImpl: options.fetchImpl,
    });

  let client = null;
  if (args.dryRun) {
    // A dry run reads, so that it can say whether the data on the site is
    // already these bytes, but it still runs with no credentials at all: then
    // it reports what it would send and leaves the comparison out.
    try {
      client = makeClient();
    } catch {
      client = null;
    }
  } else {
    client = makeClient();
  }

  const uploaded = [];
  const skipped = [];
  const failed = [];
  const dataTally = { published: 0, unchanged: 0, pending: 0, none: 0 };

  for (const dir of dirs) {
    const code = problemCodeFromDir(dir);
    try {
      let request = null;
      if (plan.statement) {
        request = await buildRequest(dir, { statementOnly: args.statementOnly });
        for (const warning of request.warnings) log(`  ${warning}`);
      }

      const archive = plan.data ? await prepareArchive(dir, code, { log, dataOnly: args.dataOnly }) : null;
      if (plan.data && !archive) dataTally.none += 1;

      if (args.dryRun) {
        if (request) {
          const fields = Object.keys(request.body).sort().join(", ");
          log(`${code}: would upload (${fields})`);
        } else {
          log(`${code}: test data only, the statement is left alone`);
        }

        let data = null;
        if (archive) {
          const summary = describeArchive(archive);
          let current = null;
          if (client) {
            try {
              current = await client.getData(code);
            } catch (error) {
              log(`  data: the site could not be asked: ${error.message}`);
            }
          }
          if (current?.hash === archive.hash) {
            data = {
              hash: archive.hash,
              size: archive.size,
              fileCount: archive.fileCount,
              status: "unchanged",
            };
            dataTally.unchanged += 1;
            log(`  data: unchanged (${summary})`);
          } else {
            data = {
              hash: archive.hash,
              size: archive.size,
              fileCount: archive.fileCount,
              status: "pending",
            };
            dataTally.pending += 1;
            const replacing = current?.hash ? `, replacing ${current.hash.slice(0, 12)}` : "";
            log(`  data: would upload ${summary}${replacing}`);
          }
        }
        skipped.push({ code, reason: "dry-run", data });
        continue;
      }

      let created = false;
      let name = code;
      if (request) {
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
        created = !!response.created;
        name = response.problem?.name ?? code;
        log(`${code}: ${created ? "created" : "updated"} "${name}"`);
        for (const warning of response.warnings ?? []) log(`  warning: ${warning}`);
      }

      let data = null;
      if (archive) {
        data = await publishArchive(code, archive, client, log);
        dataTally[data.status === "published" ? "published" : "unchanged"] += 1;
      }
      if (!request) log(`${code}: test data published, the statement was left alone`);

      uploaded.push({ code, created, name, statement: !!request, data });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errorLog(`${code}: FAILED ${message}`);
      failed.push({ code, error: message });
    }
  }

  if (registryDirty) await saveRegistry(registryFile, registry);

  log("");
  log(`${uploaded.length} uploaded, ${skipped.length} skipped, ${failed.length} failed.`);
  if (plan.data) {
    const counts = args.dryRun
      ? `${dataTally.pending} to upload, ${dataTally.unchanged} unchanged`
      : `${dataTally.published} published, ${dataTally.unchanged} unchanged`;
    log(`Test data: ${counts}, ${dataTally.none} without data.`);
  }
  const result = { uploaded, skipped, failed, exitCode: failed.length > 0 ? 1 : 0 };
  if (args.json) log(JSON.stringify(result));
  return result;
}

const HELP = `Upload problems from a problem repository to MOJ.

Publishes the statement, the metadata and the test data. The test data goes as
one deterministic zip, and an unchanged problem is not uploaded twice.

  --problem-dir <dir>     a problem directory; repeatable
  --problems-root <dir>   the directory problem directories live in
  --changed <list>        newline or comma separated changed paths
  --include <glob>        keep only problem codes matching; repeatable
  --exclude <glob>        drop problem codes matching; repeatable
  --registry <path>       image cache file (default <root>/.image-registry.json)
  --skip-data             publish the statement and metadata only
  --data-only             publish the test data only
  --statement-only        send the statement and editorial, nothing else
  --dry-run               resolve and report, send nothing
  --json                  print a machine readable summary on the last line
  --judge-url <url>       overrides JUDGE_URL
  --api-key <key>         overrides JUDGE_API_KEY

Environment:
  JUDGE_URL      the site's address, e.g. https://judge.example.org
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
