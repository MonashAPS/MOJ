"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { type ComponentProps, useCallback } from "react";
import { contestContextKey, contestHref } from "@/lib/contest-context";

/** Use the same URL rule for links and imperative navigation after submission. */
export function useContestHref() {
  const pathname = usePathname() ?? "/";
  const search = useSearchParams();
  const key = contestContextKey(pathname, search.get("contest"));

  return useCallback((href: string) => contestHref(href, key), [key]);
}

export function ContestLink({
  href,
  ...props
}: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  const withContest = useContestHref();

  return <Link {...props} href={withContest(href)} />;
}
