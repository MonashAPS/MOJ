import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  loadStatementImages,
  statementImageOrigin,
  statementImagePath,
  statementImages,
} from "./statement-images";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

let mediaRoot: string;

const places = () => ({ mediaRoot, siteUrl: "https://judge.example.test" });

beforeEach(async () => {
  mediaRoot = mkdtempSync(path.join(tmpdir(), "moj-media-"));
  await mkdir(path.join(mediaRoot, "martor"));
  writeFileSync(path.join(mediaRoot, "martor", "a.png"), PNG);
});

afterEach(() => {
  rmSync(mediaRoot, { recursive: true, force: true });
});

/** A fetch that answers from a table, and refuses anything it does not know. */
function fakeFetch(table: Record<string, Response>): typeof fetch {
  return async (input) => {
    const url = input instanceof Request ? input.url : String(input);

    return table[url] ?? new Response("missing", { status: 404 });
  };
}

describe("statementImagePath", () => {
  it("names an image after its source and keeps a known extension", () => {
    expect(statementImagePath("/media/martor/a.png")).toMatch(/^images\/[0-9a-f]{16}\.png$/);
    expect(statementImagePath("/media/martor/a.png")).toBe(statementImagePath("/media/martor/a.png"));
    expect(statementImagePath("https://x.test/api/problems/images/k1")).toMatch(/^images\/[0-9a-f]{16}$/);
  });
});

describe("statementImageOrigin", () => {
  it("reads the media tree from disk and refuses to leave it", () => {
    expect(statementImageOrigin("/media/martor/a.png", places())).toEqual({
      kind: "file",
      path: path.join(mediaRoot, "martor", "a.png"),
    });
    expect(statementImageOrigin("/media/../etc/passwd", places())).toBeNull();
  });

  it("fetches site paths from the site and remote images from their host", () => {
    expect(statementImageOrigin("/api/problems/images/k1", places())).toEqual({
      kind: "url",
      url: "https://judge.example.test/api/problems/images/k1",
    });
    expect(statementImageOrigin("https://img.test/x.png", places())).toEqual({
      kind: "url",
      url: "https://img.test/x.png",
    });
  });

  it("has nowhere to read a bare relative name or a data URI from", () => {
    expect(statementImageOrigin("swing.png", places())).toBeNull();
    expect(statementImageOrigin("data:image/png;base64,AAAA", places())).toBeNull();
  });
});

describe("loadStatementImages", () => {
  it("loads what it can and reports what it could not", async () => {
    const images = statementImages(
      ["/media/martor/a.png", "/media/martor/gone.png", "https://img.test/x.png", "https://img.test/page"],
      places(),
    );

    const { assets, missing } = await loadStatementImages(
      images,
      fakeFetch({
        "https://img.test/x.png": new Response(PNG, { headers: { "content-type": "image/png" } }),
        "https://img.test/page": new Response("<html></html>", { headers: { "content-type": "text/html" } }),
      }),
    );

    expect(assets[statementImagePath("/media/martor/a.png")]).toEqual(PNG);
    expect(assets[statementImagePath("https://img.test/x.png")]).toEqual(PNG);
    expect([...missing].sort()).toEqual(["/media/martor/gone.png", "https://img.test/page"]);
  });
});
