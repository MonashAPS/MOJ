import { describe, expect, it } from "vitest";
import { isInsideContest } from "./contest-lockdown";

const problemPages = [
  "/problem/alpha",
  "/problem/alpha/submit",
  "/problem/alpha/editorial",
  "/problem/alpha/rank",
  "/problem/alpha/submissions",
  "/problem/alpha/submissions/alice",
  "/problem/alpha/resubmit/123",
  "/problem/alpha/tickets",
  "/problem/alpha/tickets/new",
];

const contextualPages = [...problemPages, "/submission/123", "/src/123"];

const problemDownloads = [
  "/problem/alpha/pdf",
  "/problem/alpha/samples",
  "/problem/alpha/files/123/attachment.zip",
];

describe.each(["", "/"])("contest lockdown (trailing slash %j)", (suffix) => {
  it.each(contextualPages)("requires the joined contest context for %s", (pathname) => {
    expect(isInsideContest(`${pathname}${suffix}`, "round1", ["alpha"])).toBe(false);
    expect(isInsideContest(`/contest/round1${pathname}${suffix}`, "round1", ["alpha"])).toBe(true);
    expect(isInsideContest(`/contest/round2${pathname}${suffix}`, "round1", ["alpha"])).toBe(false);
  });

  it.each(["", "/ranking", "/submissions", "/leave", "/files/123/attachment.zip"])(
    "allows the joined contest's %s route",
    (pathname) => {
      expect(isInsideContest(`/contest/round1${pathname}${suffix}`, "round1", ["alpha"])).toBe(true);
      expect(isInsideContest(`/contest/round10${pathname}${suffix}`, "round1", ["alpha"])).toBe(false);
    },
  );

  it.each(problemPages)("rejects contextual problems outside the joined problem list: %s", (pathname) => {
    expect(isInsideContest(`/contest/round1${pathname}${suffix}`, "round1", [])).toBe(false);
    expect(
      isInsideContest(`/contest/round1${pathname.replace("alpha", "alpha2")}${suffix}`, "round1", ["alpha"]),
    ).toBe(false);
  });

  it.each(problemDownloads)("allows the joined problem's standalone download %s", (pathname) => {
    expect(isInsideContest(`${pathname}${suffix}`, "round1", ["alpha"])).toBe(true);
    expect(isInsideContest(`${pathname}${suffix}`, "round1", [])).toBe(false);
    expect(isInsideContest(`${pathname.replace("alpha", "alpha2")}${suffix}`, "round1", ["alpha"])).toBe(
      false,
    );
  });

  it.each([
    "/accounts",
    "/accounts/logout",
    "/accounts/password/change",
    "/proctor",
    "/src/123/raw",
    "/api",
    "/api/v2/problem/alpha",
    "/media/attachment.zip",
  ])("keeps account, proctoring and resource access open on %s", (pathname) => {
    expect(isInsideContest(`${pathname}${suffix}`, "round1", [])).toBe(true);
  });

  it.each([
    "/",
    "/problems",
    "/submissions",
    "/submission",
    "/src",
    "/src/123/raw/extra",
    "/src/123/rawness",
    "/accounts-other/logout",
    "/proctor-other",
    "/api-other",
    "/media-other/file.png",
    "/problem/alpha/pdf/extra",
    "/problem/alpha/samples/extra",
    "/problem/alpha/files",
    "/problem/alpha/files/123/attachment.zip/extra",
    "/problem/alpha/test_data",
    "/problem/alpha/manage/submission",
    "/problem/alpha/vote",
    "/problem/alpha/clone",
  ])("rejects other standalone pages and resource lookalikes on %s", (pathname) => {
    expect(isInsideContest(`${pathname}${suffix}`, "round1", ["alpha"])).toBe(false);
  });
});
