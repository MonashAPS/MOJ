import path from "node:path";
import { describe, expect, it } from "vitest";
import { MEDIA_CACHE_CONTROL, mediaContentType, resolveMediaPath } from "./media";

const ROOT = path.resolve("/srv/moj/infra/media");

describe("resolveMediaPath", () => {
  it("resolves the imported martor uploads at their DMOJ paths", () => {
    expect(resolveMediaPath(ROOT, ["martor", "0eb90a36-ca87-459d-94d9-b2fe72541767.png"])).toBe(
      path.join(ROOT, "martor", "0eb90a36-ca87-459d-94d9-b2fe72541767.png"),
    );
  });

  it("rejects traversal, empty and absolute segments", () => {
    expect(resolveMediaPath(ROOT, [])).toBeNull();
    expect(resolveMediaPath(ROOT, [".."])).toBeNull();
    expect(resolveMediaPath(ROOT, ["martor", "..", "..", "etc", "passwd"])).toBeNull();
    expect(resolveMediaPath(ROOT, ["martor", ""])).toBeNull();
    expect(resolveMediaPath(ROOT, ["martor/../../etc"])).toBeNull();
    expect(resolveMediaPath(ROOT, ["martor", "a\0b.png"])).toBeNull();
  });

  it("does not escape into a sibling directory that shares the prefix", () => {
    expect(resolveMediaPath("/srv/moj/infra/media", ["..", "media-secret", "x.png"])).toBeNull();
  });
});

describe("mediaContentType", () => {
  it("types the formats the imported statements use", () => {
    expect(mediaContentType("/x/a.png")).toBe("image/png");
    expect(mediaContentType("/x/a.JPG")).toBe("image/jpeg");
    expect(mediaContentType("/x/a.jpeg")).toBe("image/jpeg");
    expect(mediaContentType("/x/a.svg")).toBe("image/svg+xml");
    expect(mediaContentType("/x/a.unknown")).toBe("application/octet-stream");
  });
});

describe("cache policy", () => {
  it("treats content addressed uploads as immutable", () => {
    expect(MEDIA_CACHE_CONTROL).toContain("immutable");
  });
});
