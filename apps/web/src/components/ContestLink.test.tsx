/* oxlint-disable anti-slop/no-module-mocking -- Render the real component against controlled Next/Convex hooks without running their servers; child chrome is stubbed to expose the selected contest. */
import { type ComponentProps, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const location = vi.hoisted(() => ({ pathname: "/", search: "" }));

vi.mock("next/navigation", () => ({
  usePathname: () => location.pathname,
  useSearchParams: () => new URLSearchParams(location.search),
}));

vi.mock("next/link", () => ({
  default: (props: ComponentProps<"a">) => createElement("a", props),
}));

import { isInsideContest } from "@/lib/contest-lockdown";
import { ContestLink, useContestHref } from "./ContestLink";

function hrefFrom(pathname: string, search: string, href: string) {
  location.pathname = pathname;
  location.search = search;

  return renderToStaticMarkup(createElement(ContestLink, { href }, "Open"));
}

describe("contest links", () => {
  it.each(["/accounts/password/change/", "/accounts/logout/"])(
    "keeps header-dialog submission results inside lockdown from %s",
    (pathname) => {
      location.pathname = pathname;

      function SubmissionDestination() {
        const withContest = useContestHref("round1");

        return createElement("a", { href: withContest("/submission/123") }, "Result");
      }

      const markup = renderToStaticMarkup(createElement(SubmissionDestination));
      expect(markup).toContain('href="/contest/round1/submission/123"');
      expect(isInsideContest("/contest/round1/submission/123", "round1", ["alpha"])).toBe(true);
    },
  );

  it("renders context into the actual href, including before a click or new-tab action", () => {
    expect(hrefFrom("/contest/round1/", "", "/problem/alpha/")).toContain(
      'href="/contest/round1/problem/alpha/"',
    );
    expect(hrefFrom("/contest/round1/problem/alpha/", "", "/problem/alpha/editorial/")).toContain(
      'href="/contest/round1/problem/alpha/editorial/"',
    );
    expect(hrefFrom("/contest/round1/submission/123/", "", "/src/123/")).toContain(
      'href="/contest/round1/src/123/"',
    );
  });

  it("keeps bare problem visits and global navigation standalone", () => {
    expect(hrefFrom("/problem/alpha/", "", "/problem/alpha/submit/")).toContain(
      'href="/problem/alpha/submit/"',
    );
    expect(hrefFrom("/problem/alpha/", "contest=round1", "/problems/")).toContain('href="/problems/"');
    expect(hrefFrom("/problems/", "contest=round1", "/problem/alpha/")).toContain('href="/problem/alpha/"');
  });
});
