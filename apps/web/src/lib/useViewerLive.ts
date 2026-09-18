"use client";

import { useConvexAuth } from "convex/react";
import { liveAnswerStands } from "./viewer-live";

/**
 * The live answer once the browser is the viewer the server was, and the
 * server's answer until then. See `liveAnswerStands` for why.
 *
 * `serverHadViewer` is what the page was rendered with, not what the browser
 * thinks: the two disagreeing for a moment is the whole problem.
 *
 * One consequence worth knowing: a member who signs out in another tab leaves
 * this page holding what the server rendered until they navigate, because the
 * browser never becomes that viewer again. The next render is the server's, so
 * it corrects itself; the alternative is the flash on every page load, which is
 * the common case rather than the rare one.
 */
export function useViewerLive<T>(live: T | undefined, initial: T, serverHadViewer: boolean): T {
  const { isAuthenticated } = useConvexAuth();

  const stands = liveAnswerStands({
    hasLive: live !== undefined,
    serverHadViewer,
    clientIsViewer: isAuthenticated,
  });

  return stands && live !== undefined ? live : initial;
}
