import { describe, expect, it } from "vitest";
import { PER_PAGE, scopeFromParams, ticketQueryArgs } from "./filters";

describe("scopeFromParams", () => {
  it("defaults to every ticket the viewer may see", () => {
    expect(scopeFromParams(undefined)).toBe("all");
    expect(scopeFromParams("nonsense")).toBe("all");
  });

  it("keeps the two narrowing scopes", () => {
    expect(scopeFromParams("mine")).toBe("mine");
    expect(scopeFromParams("assigned")).toBe("assigned");
  });
});

describe("ticketQueryArgs", () => {
  it("pages by offset, as `sliceOffset` expects", () => {
    expect(ticketQueryArgs("all", false, 3).paginationOpts).toEqual({
      numItems: PER_PAGE,
      cursor: String(2 * PER_PAGE),
    });
  });

  it("leaves the filters off rather than sending false, so the query keeps its index", () => {
    const args = ticketQueryArgs("all", false, 1);
    expect(args.onlyOpen).toBeUndefined();
    expect(args.onlyOwn).toBeUndefined();
  });

  it("asks the backend for own tickets for both narrowing scopes", () => {
    expect(ticketQueryArgs("mine", true, 1).onlyOwn).toBe(true);
    expect(ticketQueryArgs("assigned", false, 1).onlyOwn).toBe(true);
    expect(ticketQueryArgs("mine", true, 1).onlyOpen).toBe(true);
  });

  it("takes one wide page for the assignee scope, which is narrowed on the page", () => {
    const args = ticketQueryArgs("assigned", false, 4);
    expect(args.paginationOpts.cursor).toBe("0");
    expect(args.paginationOpts.numItems).toBeGreaterThan(PER_PAGE);
  });

  it("passes the problem code through for `/problem/[code]/tickets/`", () => {
    expect(ticketQueryArgs("all", false, 1, "pondoexponentiation").problemCode).toBe("pondoexponentiation");
  });
});
