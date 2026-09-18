/**
 * Which answer a page should be drawn from while the browser is still becoming
 * the viewer the server already was.
 *
 * The server renders every page as the signed-in member: it has the cookie and
 * asks Convex with a token. The browser does not start that way. Convex's React
 * client only attaches the identity once the session has resolved, and until it
 * does the socket is open and unauthenticated — so a subscription mounted on
 * first render comes back *as nobody*, with the member's own solve ticks, score
 * and participation missing. `live === undefined` does not catch that: the
 * answer is not missing, it is answered as the wrong person.
 *
 * So a client answer may not replace the server's until the client is the same
 * viewer the server was. A page the server rendered for nobody has nothing to
 * hold back and takes the live answer immediately.
 */
export function liveAnswerStands({
  hasLive,
  serverHadViewer,
  clientIsViewer,
}: {
  /** Whether the subscription has produced anything at all yet. */
  hasLive: boolean;
  /** Whether the server rendered this page for a signed-in member. */
  serverHadViewer: boolean;
  /** Whether Convex has confirmed the browser as that member. */
  clientIsViewer: boolean;
}): boolean {
  if (!hasLive) return false;

  return serverHadViewer ? clientIsViewer : true;
}
