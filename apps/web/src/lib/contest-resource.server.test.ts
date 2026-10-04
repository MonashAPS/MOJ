/* oxlint-disable anti-slop/no-module-mocking -- Test the server boundary against controlled query and HttpOnly cookie responses, without a deployment. */

import { api } from "@convex/_generated/api";
import { type FunctionReference, getFunctionName } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type TestState = {
  contest: {
    contest?: { key: string; name: string };
    problems: { code: string }[];
    showJoinWarning?: boolean;
  } | null;
  problem: { code: string } | null;
  cookies: Map<string, { value: string }>;
  query: ReturnType<
    typeof vi.fn<
      (
        query: FunctionReference<"query">,
        args: { key?: string; browsing?: boolean; code?: string; language?: string },
      ) => void
    >
  >;
};

const state = vi.hoisted(
  (): TestState => ({
    contest: null,
    problem: null,
    cookies: new Map<string, { value: string }>(),
    query: vi.fn(),
  }),
);

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

vi.mock("next/headers", () => ({ cookies: async () => state.cookies }));

vi.mock("./language.server", () => ({ viewerLanguage: async () => "en" }));

vi.mock("./convex-server", () => ({
  queryAsViewer: (
    query: FunctionReference<"query">,
    args: { key?: string; browsing?: boolean; code?: string; language?: string },
  ) => {
    state.query(query, args);

    return Promise.resolve(
      getFunctionName(query) === getFunctionName(api.contests.navBar) ? state.contest : state.problem,
    );
  },
}));

import { requireContestProblem } from "./contest-resource.server";

beforeEach(() => {
  state.contest = {
    contest: { key: "round1", name: "Round One" },
    problems: [{ code: "alpha" }],
    showJoinWarning: true,
  };
  state.problem = { code: "alpha" };
  state.cookies.clear();
  state.query.mockClear();
});

describe("contextual resource boundary", () => {
  it("requires both resource access and membership in the released list", async () => {
    await expect(requireContestProblem("round1", "alpha")).resolves.toBe(state.contest);
    expect(state.query).toHaveBeenCalledWith(api.contests.navBar, { key: "round1", browsing: true });
    expect(state.query).toHaveBeenCalledWith(api.problems.get, { code: "alpha", language: "en" });
  });
  it.each(["inaccessible contest", "inaccessible problem", "unreleased", "unrelated"])(
    "rejects %s",
    async (scenario) => {
      if (scenario === "inaccessible contest") state.contest = null;

      if (scenario === "inaccessible problem") state.problem = null;

      if (scenario === "unreleased") state.contest = { problems: [] };
      await expect(
        requireContestProblem("round1", scenario === "unrelated" ? "other" : "alpha"),
      ).rejects.toThrow("NOT_FOUND");
    },
  );
});
