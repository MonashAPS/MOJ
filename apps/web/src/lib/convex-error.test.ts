import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { mutationError } from "./convex-error";

describe("mutationError", () => {
  it("reads the message convex/lib/errors.ts threw", () => {
    const thrown = new ConvexError({ code: "INVALID", message: "Your part is silent, little toad." });
    expect(mutationError(thrown)).toBe("Your part is silent, little toad.");
  });

  it("turns the rate limiter's shape into a sentence with a wait", () => {
    const thrown = new ConvexError({ kind: "RateLimited", name: "commentPost", retryAfter: 4200 });
    expect(mutationError(thrown)).toBe("You are doing that too often. Try again in 5 seconds.");
  });

  it("pluralises a one second wait", () => {
    const thrown = new ConvexError({ kind: "RateLimited", name: "commentPost", retryAfter: 400 });
    expect(mutationError(thrown)).toBe("You are doing that too often. Try again in 1 second.");
  });

  it("accepts a bare string payload", () => {
    expect(mutationError(new ConvexError("Comments are disabled on this page."))).toBe(
      "Comments are disabled on this page.",
    );
  });

  it("never leaks a stack frame for an unexpected error", () => {
    expect(mutationError(new Error("TypeError: x is not a function"), "Nope.")).toBe("Nope.");
    expect(mutationError(undefined)).toBe("That did not work. Try again.");
  });
});
