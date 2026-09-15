import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  buildDataArchive,
  buildRequest,
  collectDataFiles,
  collectLocalImageRefs,
  globToRegExp,
  matchesAny,
  parseArgs,
  problemCodeFromDir,
  problemCodesFromChanged,
  publishPlan,
  run,
} from "./upload-problem.mjs";

let workdir;

beforeEach(async () => {
  workdir = await fs.mkdtemp(path.join(os.tmpdir(), "moj-upload-"));
});

afterEach(async () => {
  await fs.rm(workdir, { recursive: true, force: true });
});

async function writeProblem(code, files) {
  const dir = path.join(workdir, "problems", code);
  await fs.mkdir(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    const target = path.join(dir, name);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
  }
  return dir;
}

const INIT_YML = "test_cases:\n- {in: tests/1.in, out: tests/1.out, points: 100}\n";

/** A problem with test data in it, as a repository would hold one. */
async function writeDataProblem(code, files = {}) {
  return await writeProblem(code, {
    "statement.md": "Read two integers.\n",
    "config.json": JSON.stringify({ title: "A plus B" }),
    "init.yml": INIT_YML,
    "tests/1.in": "1 2\n",
    "tests/1.out": "3\n",
    ...files,
  });
}

function sha256Hex(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function haveCommand(command) {
  try {
    execFileSync(command, ["-v"], { stdio: "ignore" });
    return true;
  } catch (error) {
    return error.code !== "ENOENT";
  }
}

/**
 * A local stand-in for the problems API: the same routes, the same response
 * shapes, and a record of every request so the tests can assert on the bodies.
 *
 * The data endpoints are here too, including the storage host the upload URL
 * points at, so a test can watch an archive go up once and stay up.
 */
function mockJudge({ existing = new Set(), failFor = new Set(), data = new Map() } = {}) {
  const calls = { puts: [], images: [], dataReads: [], uploadUrls: [], blobs: [], dataWrites: [] };
  const blobs = new Map();
  let imageCounter = 0;
  let storageCounter = 0;

  const fetchImpl = async (url, init = {}) => {
    const { host, pathname } = new URL(url);
    const method = init.method ?? "GET";

    // The storage host the upload URL points at, which answers with a storage id.
    if (host === "storage.test") {
      if (method !== "PUT" && method !== "POST") {
        return jsonResponse(405, { error: { code: "invalid", message: "Method not allowed." } });
      }
      storageCounter += 1;
      const storageId = `kg${storageCounter}`;
      const bytes = Buffer.from(init.body);
      blobs.set(storageId, bytes);
      calls.blobs.push({
        storageId,
        method,
        size: bytes.length,
        contentType: init.headers?.["content-type"],
      });
      return jsonResponse(200, { storageId });
    }

    const uploadUrlMatch = /^\/api\/problems\/([a-z.0-9]+)\/data\/upload-url$/.exec(pathname);
    if (uploadUrlMatch && method === "POST") {
      calls.uploadUrls.push({ code: uploadUrlMatch[1] });
      return jsonResponse(200, { ok: true, uploadUrl: "https://storage.test/upload" });
    }

    const dataMatch = /^\/api\/problems\/([a-z.0-9]+)\/data$/.exec(pathname);
    if (dataMatch) {
      const code = dataMatch[1];
      if (!existing.has(code)) {
        return jsonResponse(404, { error: { code: "not_found", message: "No such problem." } });
      }
      if (method === "GET") {
        calls.dataReads.push({ code });
        const row = data.get(code);
        return jsonResponse(200, row ? { ok: true, ...row } : { ok: true, hash: null });
      }
      if (method === "POST") {
        const body = JSON.parse(init.body);
        calls.dataWrites.push({ code, body, authorization: init.headers.authorization });
        const changed = data.get(code)?.hash !== body.hash;
        data.set(code, {
          hash: body.hash,
          size: body.size,
          fileCount: body.fileCount,
          uploadedAt: 1_700_000_000_000,
        });
        return jsonResponse(200, { ok: true, hash: body.hash, changed });
      }
    }

    const imageMatch = /^\/api\/problems\/([a-z.0-9]+)\/images$/.exec(pathname);
    if (imageMatch) {
      const form = init.body;
      const file = form.get("file");
      calls.images.push({ code: imageMatch[1], name: file.name, size: file.size });
      imageCounter += 1;
      return jsonResponse(200, {
        status: 200,
        link: `https://judge.test/api/problems/images/img${imageCounter}`,
      });
    }

    const putMatch = /^\/api\/problems\/([a-z.0-9]+)$/.exec(pathname);
    if (putMatch && method === "PUT") {
      const code = putMatch[1];
      const body = JSON.parse(init.body);
      calls.puts.push({ code, body, authorization: init.headers.authorization });

      if (failFor.has(code)) {
        return jsonResponse(422, {
          error: { code: "invalid", message: "A new problem requires a name." },
        });
      }
      const created = !existing.has(code);
      existing.add(code);
      return jsonResponse(200, {
        ok: true,
        created,
        problem: { code, name: body.name ?? code },
      });
    }

    return jsonResponse(404, { error: { code: "not_found", message: "No such endpoint." } });
  };

  return { calls, fetchImpl, data, blobs };
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function silent() {
  const lines = [];
  return {
    lines,
    log: (line) => lines.push(line),
    errorLog: (line) => lines.push(line),
  };
}

const ENV = { JUDGE_URL: "https://judge.test", JUDGE_API_KEY: "test-key" };

describe("parseArgs", () => {
  test("collects repeatable flags", () => {
    const args = parseArgs([
      "--problem-dir",
      "a",
      "--problem-dir",
      "b",
      "--include",
      "x*",
      "--dry-run",
      "--json",
    ]);
    expect(args.problemDirs).toEqual(["a", "b"]);
    expect(args.include).toEqual(["x*"]);
    expect(args.dryRun).toBe(true);
    expect(args.json).toBe(true);
  });

  test("insists on a target", () => {
    expect(() => parseArgs([])).toThrow(/--problem-dir/);
    expect(() => parseArgs(["--problem-dir"])).toThrow(/needs a value/);
    expect(() => parseArgs(["--nope"])).toThrow(/Unknown option/);
  });
});

describe("globs", () => {
  test("matches segments and stars", () => {
    expect(globToRegExp("winter*").test("winter25")).toBe(true);
    expect(globToRegExp("winter*").test("abc")).toBe(false);
    expect(globToRegExp("a?c").test("abc")).toBe(true);
    expect(matchesAny("aplusb", ["x*", "a*"])).toBe(true);
    expect(matchesAny("aplusb", ["x*"])).toBe(false);
  });
});

describe("problemCodesFromChanged", () => {
  test("picks the problem directory out of a changed path", () => {
    const changed = [
      "problems/aplusb/statement.md",
      "problems/aplusb/tests/1.in",
      "problems/mst/config.json",
      "README.md",
      "other/thing/file.txt",
    ].join("\n");
    expect(problemCodesFromChanged(changed, "problems").sort()).toEqual(["aplusb", "mst"]);
  });

  test("accepts a comma separated list and quoted entries", () => {
    expect(problemCodesFromChanged('"problems/a/x.md", problems/b/y.md', "problems").sort()).toEqual([
      "a",
      "b",
    ]);
  });

  test("ignores a change to the problems root itself", () => {
    expect(problemCodesFromChanged("problems/README.md", "problems")).toEqual([]);
  });
});

describe("buildRequest", () => {
  test("sends only the keys config.json carries", async () => {
    const dir = await writeProblem("aplusb", {
      "statement.md": "Read two integers.\n",
      "config.json": JSON.stringify({ title: "A plus B" }),
    });
    const request = await buildRequest(dir);
    expect(request.code).toBe("aplusb");
    expect(request.body).toEqual({ statement: "Read two integers.\n", name: "A plus B" });
  });

  test("maps a full config", async () => {
    const dir = await writeProblem("mst", {
      "statement.md": "Build a tree.\n",
      "editorial.md": "Kruskal.\n",
      "config.json": JSON.stringify({
        title: "MST",
        authors: [],
        pythonTimeLimit: 3,
        points: 100,
        timeLimit: 1,
        memoryLimit: 512000,
        shortCircuit: true,
        public: true,
      }),
    });
    const request = await buildRequest(dir);
    expect(request.body).toEqual({
      statement: "Build a tree.\n",
      editorial: { content: "Kruskal.\n", isPublic: true },
      name: "MST",
      points: 100,
      timeLimit: 1,
      memoryLimit: 512000,
      shortCircuit: true,
      isPublic: true,
      // pythonTimeLimit drives the python3 and pypy3 rows.
      languageLimits: {
        python3: { timeLimit: 3, memoryLimit: 512000 },
        pypy3: { timeLimit: 3, memoryLimit: 512000 },
      },
    });
    // An empty authors list means "unchanged", so it is never sent.
    expect(request.body).not.toHaveProperty("authors");
  });

  test("the python limits follow timeLimit when pythonTimeLimit is absent", async () => {
    const dir = await writeProblem("plain", {
      "statement.md": "x",
      "config.json": JSON.stringify({ title: "Plain", timeLimit: 2, memoryLimit: 262144 }),
    });
    const request = await buildRequest(dir);
    expect(request.body.languageLimits).toEqual({
      python3: { timeLimit: 2, memoryLimit: 262144 },
      pypy3: { timeLimit: 2, memoryLimit: 262144 },
    });
  });

  test("a non-empty authors list is sent through", async () => {
    const dir = await writeProblem("owned", {
      "statement.md": "x",
      "config.json": JSON.stringify({ title: "Owned", authors: ["swofty", " jane "] }),
    });
    expect((await buildRequest(dir)).body.authors).toEqual(["swofty", "jane"]);
  });

  test("an empty editorial is not sent", async () => {
    const dir = await writeProblem("blank", {
      "statement.md": "x",
      "editorial.md": "   \n",
      "config.json": JSON.stringify({ title: "Blank" }),
    });
    expect((await buildRequest(dir)).body).not.toHaveProperty("editorial");
  });

  test("statement-only mode drops the metadata", async () => {
    const dir = await writeProblem("aplusb", {
      "statement.md": "x",
      "editorial.md": "y",
      "config.json": JSON.stringify({ title: "A plus B", points: 5 }),
    });
    const request = await buildRequest(dir, { statementOnly: true });
    expect(Object.keys(request.body).sort()).toEqual(["editorial", "statement"]);
  });

  test("reads the misspelled statment.md too", async () => {
    const dir = await writeProblem("typo", { "statment.md": "Legacy spelling.\n" });
    const request = await buildRequest(dir);
    expect(request.body.statement).toBe("Legacy spelling.\n");
    expect(request.warnings[0]).toContain("no config.json");
  });

  test("complains about a missing statement and about bad JSON", async () => {
    const empty = await writeProblem("empty", { "config.json": "{}" });
    await expect(buildRequest(empty)).rejects.toThrow(/Missing statement file/);

    const broken = await writeProblem("broken", { "statement.md": "x", "config.json": "{" });
    await expect(buildRequest(broken)).rejects.toThrow(/Invalid JSON/);

    const negative = await writeProblem("negative", {
      "statement.md": "x",
      "config.json": JSON.stringify({ title: "N", points: -1 }),
    });
    await expect(buildRequest(negative)).rejects.toThrow(/config.points/);
  });

  test("the problem code comes from the directory name, lowercased", () => {
    expect(problemCodeFromDir("/a/b/APlusB")).toBe("aplusb");
  });
});

describe("collectLocalImageRefs", () => {
  test("finds markdown and HTML references, and leaves remote ones alone", () => {
    const markdown = [
      "![A tree](tree.png)",
      '<img src="figures/graph.svg" width="400">',
      "![Remote](https://example.com/x.png)",
      "![Absolute](/media/x.png)",
      "![Data](data:image/png;base64,AAAA)",
    ].join("\n");
    expect(collectLocalImageRefs(markdown).map((ref) => ref.localPath)).toEqual([
      "tree.png",
      "figures/graph.svg",
    ]);
  });

  test("keeps the alt text and the title when it rewrites", () => {
    const [ref] = collectLocalImageRefs('![A tree](tree.png "Figure 1")');
    expect(ref.replaceWith("https://cdn/1.png")).toBe('![A tree](https://cdn/1.png "Figure 1")');
  });
});

describe("run", () => {
  test("uploads every problem under the root", async () => {
    await writeProblem("aplusb", {
      "statement.md": "Read two integers.\n",
      "config.json": JSON.stringify({ title: "A plus B" }),
    });
    await writeProblem("mst", {
      "statement.md": "Build a tree.\n",
      "config.json": JSON.stringify({ title: "MST", points: 100 }),
    });

    const judge = mockJudge();
    const out = silent();
    const result = await run(["--problems-root", path.join(workdir, "problems")], {
      ...out,
      env: ENV,
      fetchImpl: judge.fetchImpl,
    });

    expect(result.exitCode).toBe(0);
    expect(result.uploaded.map((item) => item.code)).toEqual(["aplusb", "mst"]);
    expect(result.uploaded.every((item) => item.created)).toBe(true);
    expect(judge.calls.puts.map((call) => call.code)).toEqual(["aplusb", "mst"]);
    expect(judge.calls.puts[0].authorization).toBe("Bearer test-key");
  });

  test("only-changed uploads just the touched problems", async () => {
    await writeProblem("aplusb", { "statement.md": "a", "config.json": '{"title":"A"}' });
    await writeProblem("mst", { "statement.md": "b", "config.json": '{"title":"B"}' });

    const judge = mockJudge();
    const result = await run(
      [
        "--problems-root",
        path.join(workdir, "problems"),
        "--changed",
        "problems/mst/statement.md\nREADME.md",
      ],
      { ...silent(), env: ENV, fetchImpl: judge.fetchImpl },
    );

    expect(result.uploaded.map((item) => item.code)).toEqual(["mst"]);
  });

  test("include and exclude filter by problem code", async () => {
    await writeProblem("aplusb", { "statement.md": "a", "config.json": '{"title":"A"}' });
    await writeProblem("apples", { "statement.md": "b", "config.json": '{"title":"B"}' });
    await writeProblem("mst", { "statement.md": "c", "config.json": '{"title":"C"}' });

    const judge = mockJudge();
    const result = await run(
      ["--problems-root", path.join(workdir, "problems"), "--include", "ap*", "--exclude", "apples"],
      { ...silent(), env: ENV, fetchImpl: judge.fetchImpl },
    );
    expect(result.uploaded.map((item) => item.code)).toEqual(["aplusb"]);
  });

  test("reports an update rather than a create the second time", async () => {
    await writeProblem("aplusb", { "statement.md": "a", "config.json": '{"title":"A"}' });
    const judge = mockJudge();
    const options = { ...silent(), env: ENV, fetchImpl: judge.fetchImpl };
    const dir = path.join(workdir, "problems", "aplusb");

    const first = await run(["--problem-dir", dir], options);
    expect(first.uploaded[0].created).toBe(true);
    const second = await run(["--problem-dir", dir], options);
    expect(second.uploaded[0].created).toBe(false);
  });

  test("uploads images once and rewrites the references", async () => {
    const dir = await writeProblem("figures", {
      "statement.md": 'See ![A tree](tree.png) and <img src="graph.png">.\n',
      "editorial.md": "Also ![A tree](tree.png).\n",
      "config.json": '{"title":"Figures"}',
    });
    await fs.writeFile(path.join(dir, "tree.png"), Buffer.from([1, 2, 3]));
    await fs.writeFile(path.join(dir, "graph.png"), Buffer.from([4, 5, 6, 7]));

    const judge = mockJudge();
    const options = { ...silent(), env: ENV, fetchImpl: judge.fetchImpl };
    await run(["--problems-root", path.join(workdir, "problems")], options);

    // tree.png and graph.png, once each: the editorial's second reference to
    // tree.png comes out of the registry.
    expect(judge.calls.images.map((call) => call.name).sort()).toEqual(["graph.png", "tree.png"]);
    const [put] = judge.calls.puts;
    expect(put.body.statement).toBe(
      "See ![A tree](https://judge.test/api/problems/images/img1) and " +
        '<img src="https://judge.test/api/problems/images/img2">.\n',
    );
    expect(put.body.editorial.content).toContain("https://judge.test/api/problems/images/img1");

    // The registry is written next to the problems root and reused next time.
    const registry = JSON.parse(
      await fs.readFile(path.join(workdir, "problems", ".image-registry.json"), "utf8"),
    );
    expect(Object.keys(registry).sort()).toEqual(["figures/graph.png", "figures/tree.png"]);

    const second = mockJudge();
    await run(["--problems-root", path.join(workdir, "problems")], {
      ...silent(),
      env: ENV,
      fetchImpl: second.fetchImpl,
    });
    expect(second.calls.images).toHaveLength(0);
  });

  test("re-uploads an image whose bytes changed", async () => {
    const dir = await writeProblem("figures", {
      "statement.md": "![A tree](tree.png)\n",
      "config.json": '{"title":"Figures"}',
    });
    await fs.writeFile(path.join(dir, "tree.png"), Buffer.from([1]));

    const first = mockJudge();
    await run(["--problem-dir", dir], { ...silent(), env: ENV, fetchImpl: first.fetchImpl });
    expect(first.calls.images).toHaveLength(1);

    await fs.writeFile(path.join(dir, "tree.png"), Buffer.from([9, 9, 9]));
    const second = mockJudge();
    await run(["--problem-dir", dir], { ...silent(), env: ENV, fetchImpl: second.fetchImpl });
    expect(second.calls.images).toHaveLength(1);
  });

  test("warns about a missing image and leaves the reference alone", async () => {
    const dir = await writeProblem("figures", {
      "statement.md": "![Gone](missing.png)\n",
      "config.json": '{"title":"Figures"}',
    });
    const judge = mockJudge();
    const out = silent();
    const result = await run(["--problem-dir", dir], {
      ...out,
      env: ENV,
      fetchImpl: judge.fetchImpl,
    });

    expect(result.exitCode).toBe(0);
    expect(out.lines.join("\n")).toContain("image not found");
    expect(judge.calls.puts[0].body.statement).toBe("![Gone](missing.png)\n");
  });

  test("dry-run sends nothing", async () => {
    await writeProblem("aplusb", { "statement.md": "a", "config.json": '{"title":"A"}' });
    const judge = mockJudge();
    const out = silent();
    const result = await run(["--problems-root", path.join(workdir, "problems"), "--dry-run"], {
      ...out,
      env: ENV,
      fetchImpl: judge.fetchImpl,
    });

    expect(result.uploaded).toHaveLength(0);
    expect(result.skipped).toEqual([{ code: "aplusb", reason: "dry-run", data: null }]);
    expect(judge.calls.puts).toHaveLength(0);
    expect(out.lines.join("\n")).toContain("would upload");
  });

  test("a rejected problem fails the run without stopping the rest", async () => {
    await writeProblem("good", { "statement.md": "a", "config.json": '{"title":"Good"}' });
    await writeProblem("bad", { "statement.md": "b", "config.json": "{}" });

    const judge = mockJudge({ failFor: new Set(["bad"]) });
    const out = silent();
    const result = await run(["--problems-root", path.join(workdir, "problems")], {
      ...out,
      env: ENV,
      fetchImpl: judge.fetchImpl,
    });

    expect(result.exitCode).toBe(1);
    expect(result.uploaded.map((item) => item.code)).toEqual(["good"]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].code).toBe("bad");
    expect(result.failed[0].error).toContain("requires a name");
    expect(out.lines.join("\n")).toContain("bad: FAILED");
  });

  test("--json prints a parseable summary on the last line", async () => {
    await writeProblem("aplusb", { "statement.md": "a", "config.json": '{"title":"A"}' });
    const judge = mockJudge();
    const out = silent();
    await run(["--problems-root", path.join(workdir, "problems"), "--json"], {
      ...out,
      env: ENV,
      fetchImpl: judge.fetchImpl,
    });

    const summary = JSON.parse(out.lines.at(-1));
    expect(summary.uploaded).toEqual([
      { code: "aplusb", created: true, name: "A", statement: true, data: null },
    ]);
    expect(summary.failed).toEqual([]);
  });

  test("refuses to run without a judge URL or an API key", async () => {
    await writeProblem("aplusb", { "statement.md": "a", "config.json": '{"title":"A"}' });
    await expect(
      run(["--problems-root", path.join(workdir, "problems")], { ...silent(), env: {} }),
    ).rejects.toThrow(/JUDGE_URL/);
    await expect(
      run(["--problems-root", path.join(workdir, "problems")], {
        ...silent(),
        env: { JUDGE_URL: "https://judge.test" },
      }),
    ).rejects.toThrow(/JUDGE_API_KEY/);
  });

  test("says so when nothing is selected", async () => {
    await fs.mkdir(path.join(workdir, "problems"), { recursive: true });
    const out = silent();
    const result = await run(["--problems-root", path.join(workdir, "problems")], {
      ...out,
      env: ENV,
    });
    expect(result.uploaded).toHaveLength(0);
    expect(out.lines.join("\n")).toContain("No problems selected.");
  });
});

describe("publishPlan", () => {
  test("publishes both halves by default and one half on request", () => {
    expect(publishPlan(parseArgs(["--problem-dir", "a"]))).toEqual({ statement: true, data: true });
    expect(publishPlan(parseArgs(["--problem-dir", "a", "--skip-data"]))).toEqual({
      statement: true,
      data: false,
    });
    expect(publishPlan(parseArgs(["--problem-dir", "a", "--data-only"]))).toEqual({
      statement: false,
      data: true,
    });
    expect(publishPlan(parseArgs(["--problem-dir", "a", "--statement-only"]))).toEqual({
      statement: true,
      data: false,
    });
  });

  test("refuses the contradictory pairs", () => {
    expect(() => parseArgs(["--problem-dir", "a", "--data-only", "--skip-data"])).toThrow(/contradict/);
    expect(() => parseArgs(["--problem-dir", "a", "--data-only", "--statement-only"])).toThrow(/contradict/);
  });
});

describe("collectDataFiles", () => {
  test("takes the data and leaves the statement half behind", async () => {
    const dir = await writeDataProblem("aplusb", {
      "editorial.md": "Add them.\n",
      "checker.py": "def check(*args, **kwargs):\n    return True\n",
      "tests/2.in": "3 4\n",
      "tests/2.out": "7\n",
      "images/diagram.png": "png",
      "__pycache__/checker.cpython-312.pyc": "bytecode",
      ".gitattributes": "* -text\n",
      ".hidden/secret.txt": "shh",
    });

    expect((await collectDataFiles(dir)).map((file) => file.archivePath)).toEqual([
      "checker.py",
      "images/diagram.png",
      "init.yml",
      "tests/1.in",
      "tests/1.out",
      "tests/2.in",
      "tests/2.out",
    ]);
  });

  test("sorts by path so the filesystem's order does not leak in", async () => {
    const dir = await writeProblem("sorted", {
      "init.yml": INIT_YML,
      "zeta.txt": "z",
      "alpha.txt": "a",
      "tests/b.in": "b",
      "tests/a.in": "a",
    });
    const paths = (await collectDataFiles(dir)).map((file) => file.archivePath);
    expect(paths).toEqual([...paths].sort());
    expect(paths).toEqual(["alpha.txt", "init.yml", "tests/a.in", "tests/b.in", "zeta.txt"]);
  });
});

describe("buildDataArchive", () => {
  test("writes a zip real unzippers accept", async () => {
    const dir = await writeDataProblem("aplusb", { "sol.py": "print(sum(map(int, input().split())))\n" });
    const archive = await buildDataArchive(dir);
    const zipPath = path.join(workdir, "aplusb.zip");
    await fs.writeFile(zipPath, archive.bytes);

    expect(archive.fileCount).toBe(4);
    expect(archive.size).toBe(archive.bytes.length);
    expect(archive.hash).toBe(sha256Hex(archive.bytes));

    if (haveCommand("unzip")) {
      const report = execFileSync("unzip", ["-t", zipPath], { encoding: "utf8" });
      expect(report).toContain("No errors detected");
    }

    const listing = execFileSync(
      "python3",
      [
        "-c",
        [
          "import json, sys, zipfile",
          "z = zipfile.ZipFile(sys.argv[1])",
          "assert z.testzip() is None",
          "print(json.dumps({n: z.read(n).decode() for n in z.namelist()}))",
        ].join("\n"),
        zipPath,
      ],
      { encoding: "utf8" },
    );
    expect(JSON.parse(listing)).toEqual({
      "init.yml": INIT_YML,
      "sol.py": "print(sum(map(int, input().split())))\n",
      "tests/1.in": "1 2\n",
      "tests/1.out": "3\n",
    });
  });

  test("a case big enough to compress round-trips through the deflate path", async () => {
    const body = "1 2\n".repeat(20_000);
    const dir = await writeProblem("big", { "init.yml": INIT_YML, "tests/1.in": body });
    const archive = await buildDataArchive(dir);
    expect(archive.size).toBeLessThan(body.length / 10);

    const zipPath = path.join(workdir, "big.zip");
    await fs.writeFile(zipPath, archive.bytes);
    const output = execFileSync(
      "python3",
      [
        "-c",
        "import sys, zipfile; sys.stdout.write(zipfile.ZipFile(sys.argv[1]).read('tests/1.in').decode())",
        zipPath,
      ],
      { encoding: "utf8" },
    );
    expect(output).toBe(body);
  });

  test("the same data hashes the same however the files were touched", async () => {
    const dir = await writeDataProblem("stable", { "tests/2.in": "5 7\n", "tests/2.out": "12\n" });
    const first = await buildDataArchive(dir);

    // Two checkouts of one commit differ in mtime and in nothing else.
    const stamp = new Date("2001-02-03T04:05:06Z");
    for (const name of ["init.yml", "tests/1.in", "tests/1.out", "tests/2.in", "tests/2.out"]) {
      await fs.utimes(path.join(dir, name), stamp, stamp);
    }
    const second = await buildDataArchive(dir);

    expect(second.hash).toBe(first.hash);
    expect(second.bytes.equals(first.bytes)).toBe(true);
  });

  test("the same data in another directory hashes the same, different data does not", async () => {
    const dir = await writeDataProblem("here");
    const elsewhere = path.join(workdir, "elsewhere", "there");
    await fs.cp(dir, elsewhere, { recursive: true });

    const original = await buildDataArchive(dir);
    expect((await buildDataArchive(elsewhere)).hash).toBe(original.hash);

    await fs.writeFile(path.join(elsewhere, "tests", "1.out"), "4\n");
    expect((await buildDataArchive(elsewhere)).hash).not.toBe(original.hash);
  });

  test("the statement half never changes the hash", async () => {
    const dir = await writeDataProblem("independent");
    const before = await buildDataArchive(dir);
    await fs.writeFile(path.join(dir, "statement.md"), "A completely different statement.\n");
    await fs.writeFile(path.join(dir, "config.json"), JSON.stringify({ title: "Renamed", points: 50 }));
    expect((await buildDataArchive(dir)).hash).toBe(before.hash);
  });

  test("refuses a file too big for a zip with no zip64 records", async () => {
    const dir = await writeProblem("huge", { "init.yml": INIT_YML });
    const target = path.join(dir, "tests.zip");
    const fourGiB = 4 * 1024 ** 3;
    try {
      const handle = await fs.open(target, "w");
      await handle.truncate(fourGiB);
      await handle.close();
    } catch {
      return; // no sparse files here, and writing four real gigabytes is not a unit test
    }
    if ((await fs.stat(target)).size !== fourGiB) return;

    await expect(buildDataArchive(dir)).rejects.toThrow(/4 GB/);
  });
});

describe("run, publishing test data", () => {
  test("publishes the archive after the statement", async () => {
    await writeDataProblem("aplusb");
    const judge = mockJudge();
    const out = silent();
    const result = await run(["--problems-root", path.join(workdir, "problems")], {
      ...out,
      env: ENV,
      fetchImpl: judge.fetchImpl,
    });

    expect(result.exitCode).toBe(0);
    expect(judge.calls.puts.map((call) => call.code)).toEqual(["aplusb"]);
    expect(judge.calls.uploadUrls).toEqual([{ code: "aplusb" }]);
    expect(judge.calls.blobs).toHaveLength(1);
    expect(judge.calls.blobs[0].contentType).toBe("application/zip");

    const [write] = judge.calls.dataWrites;
    const bytes = judge.blobs.get(write.body.storageId);
    expect(write.authorization).toBe("Bearer test-key");
    expect(write.body.hash).toBe(sha256Hex(bytes));
    expect(write.body.size).toBe(bytes.length);
    expect(write.body.fileCount).toBe(3);
    expect(result.uploaded[0].data).toEqual({
      hash: write.body.hash,
      size: write.body.size,
      fileCount: 3,
      status: "published",
    });
    expect(out.lines.join("\n")).toContain("data: published (3 files,");
  });

  test("asks first and sends nothing when the site already holds the bytes", async () => {
    await writeDataProblem("aplusb");
    const judge = mockJudge();
    const options = { ...silent(), env: ENV, fetchImpl: judge.fetchImpl };
    const args = ["--problems-root", path.join(workdir, "problems")];

    await run(args, options);
    const second = await run(args, { ...silent(), env: ENV, fetchImpl: judge.fetchImpl });

    expect(judge.calls.blobs).toHaveLength(1);
    expect(judge.calls.uploadUrls).toHaveLength(1);
    expect(judge.calls.dataWrites).toHaveLength(1);
    expect(judge.calls.dataReads).toHaveLength(2);
    expect(second.uploaded[0].data.status).toBe("unchanged");
  });

  test("uploads again once the data changes", async () => {
    const dir = await writeDataProblem("aplusb");
    const judge = mockJudge();
    const args = ["--problem-dir", dir];
    await run(args, { ...silent(), env: ENV, fetchImpl: judge.fetchImpl });

    await fs.writeFile(path.join(dir, "tests", "2.in"), "5 7\n");
    await fs.writeFile(path.join(dir, "tests", "2.out"), "12\n");
    const second = await run(args, { ...silent(), env: ENV, fetchImpl: judge.fetchImpl });

    expect(judge.calls.blobs).toHaveLength(2);
    expect(second.uploaded[0].data.status).toBe("published");
    expect(second.uploaded[0].data.fileCount).toBe(5);
  });

  test("falls back to POST when the storage host refuses PUT", async () => {
    await writeDataProblem("aplusb");
    const judge = mockJudge();
    const fetchImpl = async (url, init = {}) => {
      if (new URL(url).host === "storage.test" && (init.method ?? "GET") === "PUT") {
        return jsonResponse(405, { error: { code: "invalid", message: "Method not allowed." } });
      }
      return await judge.fetchImpl(url, init);
    };

    const result = await run(["--problems-root", path.join(workdir, "problems")], {
      ...silent(),
      env: ENV,
      fetchImpl,
    });
    expect(result.exitCode).toBe(0);
    expect(judge.calls.blobs.map((blob) => blob.method)).toEqual(["POST"]);
  });

  test("--skip-data publishes the statement and nothing else", async () => {
    await writeDataProblem("aplusb");
    const judge = mockJudge();
    const result = await run(["--problems-root", path.join(workdir, "problems"), "--skip-data"], {
      ...silent(),
      env: ENV,
      fetchImpl: judge.fetchImpl,
    });

    expect(judge.calls.puts).toHaveLength(1);
    expect(judge.calls.dataReads).toHaveLength(0);
    expect(judge.calls.blobs).toHaveLength(0);
    expect(result.uploaded[0].data).toBe(null);
  });

  test("--statement-only publishes no data either", async () => {
    await writeDataProblem("aplusb");
    const judge = mockJudge();
    await run(["--problems-root", path.join(workdir, "problems"), "--statement-only"], {
      ...silent(),
      env: ENV,
      fetchImpl: judge.fetchImpl,
    });
    expect(judge.calls.blobs).toHaveLength(0);
  });

  test("--data-only leaves the statement alone", async () => {
    await writeDataProblem("aplusb");
    const judge = mockJudge({ existing: new Set(["aplusb"]) });
    const out = silent();
    const result = await run(["--problems-root", path.join(workdir, "problems"), "--data-only"], {
      ...out,
      env: ENV,
      fetchImpl: judge.fetchImpl,
    });

    expect(judge.calls.puts).toHaveLength(0);
    expect(judge.calls.images).toHaveLength(0);
    expect(judge.calls.blobs).toHaveLength(1);
    expect(result.uploaded[0].statement).toBe(false);
    expect(result.uploaded[0].data.status).toBe("published");
    expect(out.lines.join("\n")).toContain("test data published");
  });

  test("--data-only fails on a problem the site does not have", async () => {
    await writeDataProblem("aplusb");
    const judge = mockJudge();
    const out = silent();
    const result = await run(["--problems-root", path.join(workdir, "problems"), "--data-only"], {
      ...out,
      env: ENV,
      fetchImpl: judge.fetchImpl,
    });

    expect(result.exitCode).toBe(1);
    expect(result.failed[0].error).toContain("no such problem");
    expect(judge.calls.blobs).toHaveLength(0);
  });

  test("a problem with no init.yml publishes its statement and no data", async () => {
    await writeProblem("textonly", {
      "statement.md": "Words only.\n",
      "config.json": '{"title":"Text only"}',
      "sol.cpp": "int main() {}\n",
    });
    const judge = mockJudge();
    const out = silent();
    const result = await run(["--problems-root", path.join(workdir, "problems")], {
      ...out,
      env: ENV,
      fetchImpl: judge.fetchImpl,
    });

    expect(result.uploaded[0].data).toBe(null);
    expect(judge.calls.dataReads).toHaveLength(0);
    expect(judge.calls.blobs).toHaveLength(0);
    expect(out.lines.join("\n")).toContain("data: not published, the directory has no init.yml");
  });

  test("--data-only refuses a problem with no init.yml", async () => {
    await writeProblem("textonly", {
      "statement.md": "Words only.\n",
      "config.json": '{"title":"Text only"}',
    });
    const judge = mockJudge({ existing: new Set(["textonly"]) });
    const result = await run(["--problems-root", path.join(workdir, "problems"), "--data-only"], {
      ...silent(),
      env: ENV,
      fetchImpl: judge.fetchImpl,
    });

    expect(result.exitCode).toBe(1);
    expect(result.failed[0].error).toContain("no test data to publish");
  });

  test("--dry-run reports the hash and uploads nothing", async () => {
    const dir = await writeDataProblem("aplusb");
    const judge = mockJudge({ existing: new Set(["aplusb"]) });
    const out = silent();
    const result = await run(["--problem-dir", dir, "--dry-run"], {
      ...out,
      env: ENV,
      fetchImpl: judge.fetchImpl,
    });

    const archive = await buildDataArchive(dir);
    expect(result.skipped[0].data).toEqual({
      hash: archive.hash,
      size: archive.size,
      fileCount: 3,
      status: "pending",
    });
    expect(out.lines.join("\n")).toContain(`would upload 3 files,`);
    expect(out.lines.join("\n")).toContain(archive.hash.slice(0, 12));
    expect(judge.calls.puts).toHaveLength(0);
    expect(judge.calls.uploadUrls).toHaveLength(0);
    expect(judge.calls.blobs).toHaveLength(0);
    expect(judge.calls.dataWrites).toHaveLength(0);
    expect(judge.calls.dataReads).toHaveLength(1);
  });

  test("--dry-run says so when the site already holds the data", async () => {
    const dir = await writeDataProblem("aplusb");
    const judge = mockJudge({ existing: new Set(["aplusb"]) });
    await run(["--problem-dir", dir], { ...silent(), env: ENV, fetchImpl: judge.fetchImpl });

    const out = silent();
    const result = await run(["--problem-dir", dir, "--dry-run"], {
      ...out,
      env: ENV,
      fetchImpl: judge.fetchImpl,
    });
    expect(result.skipped[0].data.status).toBe("unchanged");
    expect(out.lines.join("\n")).toContain("data: unchanged");
  });

  test("--dry-run still reports the hash with no credentials at all", async () => {
    const dir = await writeDataProblem("aplusb");
    const out = silent();
    const result = await run(["--problem-dir", dir, "--dry-run"], { ...out, env: {} });

    const archive = await buildDataArchive(dir);
    expect(result.exitCode).toBe(0);
    expect(result.skipped[0].data.hash).toBe(archive.hash);
    expect(out.lines.join("\n")).toContain("would upload 3 files,");
  });
});
