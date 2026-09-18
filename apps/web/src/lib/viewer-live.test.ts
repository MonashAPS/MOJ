import { describe, expect, it } from "vitest";
import { liveAnswerStands } from "./viewer-live";

describe("liveAnswerStands", () => {
  it("waits for an answer before preferring one", () => {
    expect(liveAnswerStands({ hasLive: false, serverHadViewer: true, clientIsViewer: true })).toBe(false);
    expect(liveAnswerStands({ hasLive: false, serverHadViewer: false, clientIsViewer: false })).toBe(false);
  });

  it("holds the server's answer while the browser is still nobody", () => {
    // The window this exists for: the subscription has answered, but it
    // answered as an anonymous viewer, so the member's own state is missing.
    expect(liveAnswerStands({ hasLive: true, serverHadViewer: true, clientIsViewer: false })).toBe(false);
  });

  it("takes the live answer once the browser is that member", () => {
    expect(liveAnswerStands({ hasLive: true, serverHadViewer: true, clientIsViewer: true })).toBe(true);
  });

  it("holds nothing back on a page rendered for nobody", () => {
    // A visitor's page is the same answer either way, and waiting on an
    // identity that will never arrive would freeze it.
    expect(liveAnswerStands({ hasLive: true, serverHadViewer: false, clientIsViewer: false })).toBe(true);
  });

  it("takes the live answer for someone who signs in on the page", () => {
    expect(liveAnswerStands({ hasLive: true, serverHadViewer: false, clientIsViewer: true })).toBe(true);
  });
});
