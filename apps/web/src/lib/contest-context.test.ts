import { describe, expect, it } from "vitest";
import { contestContainsProblem, contestContextKey, contestHref } from "./contest-context";
import { isInsideContest } from "./contest-lockdown";

const routes = [
  "/problem/alpha/",
  "/problem/alpha/submit/",
  "/problem/alpha/editorial/",
  "/problem/alpha/submissions/",
  "/problem/alpha/submissions/alice/",
  "/problem/alpha/rank/",
  "/problem/alpha/resubmit/123/",
  "/problem/alpha/tickets/",
  "/problem/alpha/tickets/new/",
  "/submission/123/",
  "/src/123/",
];

describe("pathname contest browsing context", () => {
  it.each(routes)("keeps context on %s through a new tab or refresh", (path) => {
    const nested = contestHref(path, "round1");
    expect(nested).toBe(`/contest/round1${path}`);
    expect(contestContextKey(nested)).toBe("round1");
    expect(contestHref(nested, "round2")).toBe(nested);
    expect(contestContextKey(path)).toBeNull();
    expect(contestHref(path, null)).toBe(path);
  });

  it("preserves ordinary filters and fragments without normalizing them", () => {
    expect(contestHref("/problem/alpha/submissions/?status=AC&status=WA#results", "round1")).toBe(
      "/contest/round1/problem/alpha/submissions/?status=AC&status=WA#results",
    );
    expect(contestContextKey("/contest/round1/ranking/")).toBe("round1");
  });

  it.each([
    "/problems/",
    "/submissions/",
    "/contest/round2/problem/alpha/",
    "/user/alice/",
    "/organization/1/",
    "/problem/alpha/vote/",
    "/problem/alpha/test_data/",
    "/problem/alpha/manage/submission/",
    "/problem/alpha/clone/",
    "/problem/alpha/pdf",
    "/problem/alpha/samples",
    "/problem/alpha/file/x",
    "/src/123/raw/",
    "/ticket/123/",
    "/admin/problem/alpha/",
    "/media/file.png",
    "#results",
    "https://example.com/problem/alpha/",
    "//example.com/problem/alpha/",
  ])("leaves deliberate exits and explicit destinations alone: %s", (href) => {
    expect(contestHref(href, "round1")).toBe(href);
  });

  it.each(["", "..", ".", "../round1", "round 1", "round1?x=1"])("rejects invalid key %s", (key) => {
    expect(contestHref("/problem/alpha/", key)).toBe("/problem/alpha/");
  });

  it("checks nested and standalone membership using complete problem segments", () => {
    for (const prefix of ["", "/contest/round1"]) {
      expect(contestContainsProblem(`${prefix}/problem/alpha/editorial/`, ["alpha"])).toBe(true);
      expect(contestContainsProblem(`${prefix}/problem/alpha2/`, ["alpha"])).toBe(false);
      expect(contestContainsProblem(`${prefix}/problem/alpha/`, [])).toBe(false);
    }
  });

  it("does not bypass lockdown via contest prefixes or fabricated problem membership", () => {
    for (const path of [
      "/contest/round10/",
      "/contest/round1-other/",
      "/contest/round1/problem/other/",
      "/problem/alpha/",
      "/problem/alpha2/",
    ]) {
      expect(isInsideContest(path, "round1", ["alpha"])).toBe(false);
    }

    for (const path of [
      "/contest/round1/",
      "/contest/round1/problem/alpha/submit/",
      "/accounts/logout/",
      "/proctor/",
      "/src/123/raw/",
      "/api/test",
      "/media/a.png",
    ]) {
      expect(isInsideContest(path, "round1", ["alpha"])).toBe(true);
    }
  });
});
