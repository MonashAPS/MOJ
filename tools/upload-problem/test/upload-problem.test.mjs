import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  buildRequest,
  collectLocalImageRefs,
  globToRegExp,
  matchesAny,
  parseArgs,
  problemCodeFromDir,
  problemCodesFromChanged,
  run,
} from "../upload-problem.mjs";

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
    await fs.writeFile(path.join(dir, name), content);
  }
  return dir;
}

/**
 * A local stand-in for the problems API: the same routes, the same response
 * shapes, and a record of every request so the tests can assert on the bodies.
 */
function mockJudge({ existing = new Set(), failFor = new Set() } = {}) {
  const calls = { puts: [], images: [] };
  let imageCounter = 0;

  const fetchImpl = async (url, init) => {
    const { pathname } = new URL(url);
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
    if (putMatch && init.method === "PUT") {
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

  return { calls, fetchImpl };
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
    expect(globToRegExp("mcpc*").test("mcpc25")).toBe(true);
    expect(globToRegExp("mcpc*").test("abc")).toBe(false);
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

  test("maps the club's full config", async () => {
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
    expect(result.skipped).toEqual([{ code: "aplusb", reason: "dry-run" }]);
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
    expect(summary.uploaded).toEqual([{ code: "aplusb", created: true, name: "A" }]);
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
