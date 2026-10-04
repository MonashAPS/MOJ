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

import { contestContainsProblem, contestContextKey, contestProblemCode } from "./contest-context";

const ALWAYS_OPEN = /^\/(accounts|proctor|api|media)(\/|$)/;

const RAW_SOURCE = /^\/src\/[^/]+\/raw\/?$/;

const PROBLEM_DOWNLOAD = /^\/problem\/[^/]+\/(?:pdf|samples|files\/[^/]+\/[^/]+)\/?$/;

export function isInsideContest(
  pathname: string,
  contestKey: string,
  problemCodes: readonly string[],
): boolean {
  const browsingKey = contestContextKey(pathname);

  if (browsingKey) {
    return browsingKey === contestKey && contestContainsProblem(pathname, problemCodes);
  }

  if (ALWAYS_OPEN.test(pathname) || RAW_SOURCE.test(pathname)) return true;

  // HTML pages must retain the joined contest's context. These resources have
  // standalone URLs and enforce their own access checks at the download route.
  if (!PROBLEM_DOWNLOAD.test(pathname)) return false;

  const problemCode = contestProblemCode(pathname);

  return !!problemCode && problemCodes.includes(problemCode);
}

/** Where `proxy.ts` leaves the path for the server components to read. */
export const PATHNAME_HEADER = "x-moj-pathname";
