/**
 * Where a locked-down contestant is allowed to be.
 *
 * Replacing the nav only governs what you can click. Typing a URL, or opening a
 * second tab on the home page, went around it entirely, so this is checked on
 * the server before the page renders as well as on the client between
 * navigations.
 *
 * Everything the contest bar offers lives under these prefixes, and so does the
 * way out: the contest page carries Leave, and logging out has to stay
 * reachable or the lockdown is a trap.
 */

const ALWAYS_OPEN = /^\/(accounts|proctor|submission|src|api|media)(\/|$)/;

export function isInsideContest(
  pathname: string,
  contestKey: string,
  problemCodes: readonly string[],
): boolean {
  if (pathname.startsWith(`/contest/${contestKey}`)) return true;

  if (ALWAYS_OPEN.test(pathname)) return true;

  const problemCode = /^\/problem\/([a-z0-9._-]+)/i.exec(pathname)?.[1];

  return !!problemCode && problemCodes.includes(problemCode);
}

/** Where `proxy.ts` leaves the path for the server components to read. */
export const PATHNAME_HEADER = "x-moj-pathname";
