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

import { ContestLink } from "./ContestLink";

function hrefFrom(pathname: string, search: string, href: string) {
  location.pathname = pathname;
  location.search = search;

  return renderToStaticMarkup(createElement(ContestLink, { href }, "Open"));
}

describe("contest links", () => {
  it("renders context into the actual href, including before a click or new-tab action", () => {
    expect(hrefFrom("/contest/round1/", "", "/problem/alpha/")).toContain(
      'href="/problem/alpha/?contest=round1"',
    );
    expect(hrefFrom("/problem/alpha/", "contest=round1", "/problem/alpha/editorial/")).toContain(
      'href="/problem/alpha/editorial/?contest=round1"',
    );
    expect(hrefFrom("/submission/123/", "contest=round1", "/src/123/")).toContain(
      'href="/src/123/?contest=round1"',
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
