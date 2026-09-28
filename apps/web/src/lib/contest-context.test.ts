import { describe, expect, it } from "vitest";
import { contestContainsProblem, contestContextKey, contestHref } from "./contest-context";

describe("URL contest browsing context", () => {
  it("uses the contest route ahead of a query parameter", () => {
    expect(contestContextKey("/contest/round1/ranking/", "round2")).toBe("round1");
  });

  it("restores context from the URL on every problem, submission and source page", () => {
    for (const path of [
      "/problem/alpha/",
      "/problem/alpha/submit/",
      "/problem/alpha/editorial/",
      "/problem/alpha/submissions/",
      "/submission/123/",
      "/src/123/",
    ]) {
      expect(contestContextKey(path, "round1")).toBe("round1");
      expect(contestContextKey(path, null)).toBeNull();
    }
  });

  it("ignores context on global routes and rejects invalid keys", () => {
    for (const path of ["/", "/contests/", "/problems/", "/submissions/", "/users/"]) {
      expect(contestContextKey(path, "round1")).toBeNull();
    }

    for (const key of ["", "../round1", "round 1", "round1?x=1"]) {
      expect(contestContextKey("/problem/alpha/", key)).toBeNull();
    }
  });

  it("does not show a contest on an unrelated problem", () => {
    expect(contestContainsProblem("/problem/alpha/editorial/", ["alpha"])).toBe(true);
    expect(contestContainsProblem("/problem/alpha2/", ["alpha"])).toBe(false);
    expect(contestContainsProblem("/problem/alpha/", [])).toBe(false);
    expect(contestContainsProblem("/contest/round1/", [])).toBe(true);
  });

  it("carries context through a complete browsing flow using shareable URLs", () => {
    let current = "/contest/round1/";

    for (const target of [
      "/problem/alpha/",
      "/problem/alpha/submit/",
      "/submission/123/",
      "/src/123/",
      "/problem/alpha/resubmit/123/",
    ]) {
      const url = new URL(current, "https://moj.test");
      current = contestHref(target, contestContextKey(url.pathname, url.searchParams.get("contest")));
      expect(current).toBe(`${target}?contest=round1`);
    }
  });

  it("preserves filters, fragments and explicit contest destinations", () => {
    expect(contestHref("/problem/alpha/submissions/?status=AC#results", "round1")).toBe(
      "/problem/alpha/submissions/?status=AC&contest=round1#results",
    );
    expect(contestHref("/problem/alpha/?contest=round2", "round1")).toBe("/problem/alpha/?contest=round2");
    expect(contestHref("/problem/alpha/", null)).toBe("/problem/alpha/");

    for (const href of [
      "/problems/",
      "/submissions/",
      "/contest/round2/",
      "/user/alice/",
      "https://example.com/problem/alpha/",
      "//example.com/problem/alpha/",
    ]) {
      expect(contestHref(href, "round1")).toBe(href);
    }
  });
});
