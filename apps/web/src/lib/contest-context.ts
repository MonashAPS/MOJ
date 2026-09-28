const CONTEST_KEY = /^[a-z0-9._-]+$/i;

const CONTEXT_ROUTE = /^\/(problem|submission|src)\/[^/]+(?:\/|$)/;

/** Browsing context is explicit, so refreshes and new tabs behave like clicks. */
export function contestContextKey(pathname: string, queryKey: string | null): string | null {
  const routeKey = /^\/contest\/([a-z0-9._-]+)(?:\/|$)/i.exec(pathname)?.[1];

  if (routeKey) return routeKey;

  return CONTEXT_ROUTE.test(pathname) && queryKey && CONTEST_KEY.test(queryKey) ? queryKey : null;
}

/** Keep context on local problem/submission links, never on global navigation. */
export function contestHref(href: string, key: string | null): string {
  if (!key || !CONTEST_KEY.test(key) || !CONTEXT_ROUTE.test(href.split(/[?#]/)[0] ?? "")) return href;
  const url = new URL(href, "https://moj.invalid");

  if (!url.searchParams.has("contest")) url.searchParams.set("contest", key);

  return `${url.pathname}${url.search}${url.hash}`;
}

export function contestContainsProblem(pathname: string, codes: readonly string[]): boolean {
  const code = /^\/problem\/([^/]+)(?:\/|$)/.exec(pathname)?.[1];

  return !code || codes.includes(code);
}
