const CONTEST_KEY = /^[a-z0-9._-]+$/i;

// Only HTML destinations that have a contextual route. Downloads and maintenance
// pages deliberately retain their standalone destinations.
const CONTEXT_ROUTE =
  /^\/(?:problem\/[^/]+(?:\/(?:submit|editorial|rank|submissions(?:\/[^/]+)?|resubmit\/[^/]+|tickets(?:\/new)?))?|(?:submission|src)\/[^/]+)\/?$/;

/** Browsing context comes only from exact pathname segments. */
export function contestContextKey(pathname: string): string | null {
  return /^\/contest\/([a-z0-9._-]+)(?:\/|$)/i.exec(pathname)?.[1] ?? null;
}

export function contestHref(href: string, key: string | null): string {
  if (!key || !CONTEST_KEY.test(key) || key === "." || key === "..") return href;
  const path = href.split(/[?#]/)[0] ?? "";

  if (!CONTEXT_ROUTE.test(path)) return href;

  return `/contest/${key}${href}`;
}

export function contestProblemCode(pathname: string): string | null {
  return /^\/(?:contest\/[a-z0-9._-]+\/)?problem\/([^/]+)(?:\/|$)/i.exec(pathname)?.[1] ?? null;
}

export function contestContainsProblem(pathname: string, codes: readonly string[]): boolean {
  const code = contestProblemCode(pathname);

  return !code || codes.includes(code);
}
