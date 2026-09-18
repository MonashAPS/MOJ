import { describe, expect, it } from "vitest";
import { redirectTo } from "./redirect";

describe("redirectTo", () => {
  it("sends the path as given, with no origin in front of it", () => {
    // The bug this replaced: a route handler behind a proxy has no honest
    // origin to reach for, and sent browsers to the address the server binds.
    const response = redirectTo("/users/#!pleeric");

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/users/#!pleeric");
  });

  it("keeps a query string intact", () => {
    expect(redirectTo("/users/?missing=nobody").headers.get("location")).toBe("/users/?missing=nobody");
  });

  it("takes the status the caller wants", () => {
    expect(redirectTo("/problems/", 308).status).toBe(308);
  });

  it("carries no body", async () => {
    expect(await redirectTo("/").text()).toBe("");
  });
});
