import "next/dist/server/node-environment-baseline";
import { workAsyncStorage } from "next/dist/server/app-render/work-async-storage.external";
import { workUnitAsyncStorage } from "next/dist/server/app-render/work-unit-async-storage.external";
import { createRequestStoreForAPI } from "next/dist/server/async-storage/request-store";
import { createWorkStore } from "next/dist/server/async-storage/work-store";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { problemsViewedCookieName } from "@/lib/problems-join-cover";
import { dismissProblemsJoinCover } from "./actions";

describe("dismissProblemsJoinCover", () => {
  it("persists a server-readable preference scoped to the selected contest", async () => {
    const request = new NextRequest("https://example.com/contest/example/");

    const store = createRequestStoreForAPI(
      request,
      request.nextUrl,
      { tags: [], expirationsByCacheKind: new Map() },
      undefined,
      undefined,
      undefined,
    );

    const work = createWorkStore({
      page: "/contest/[key]/page",
      buildId: "test",
      deploymentId: "test",
      previouslyRevalidatedTags: [],
      renderOpts: {
        supportsDynamicResponse: true,
        isPossibleServerAction: true,
        cacheLifeProfiles: { default: { stale: 300, revalidate: 900, expire: 3600 } },
        staticPageGenerationTimeout: 60,
        cacheComponents: false,
        validationLevel: "warning",
        experimental: { authInterrupts: false, useCacheTimeout: 60 },
        waitUntil: undefined,
        onClose: () => {},
        onAfterTaskError: undefined,
      },
    });

    await workAsyncStorage.run(work, () =>
      workUnitAsyncStorage.run(store, () => dismissProblemsJoinCover("example")),
    );

    expect(store.mutableCookies.get(problemsViewedCookieName("example"))).toEqual(
      expect.objectContaining({
        value: "1",
        path: "/contest/example",
        maxAge: 31_536_000,
        httpOnly: true,
        sameSite: "lax",
      }),
    );
    expect(store.mutableCookies.get(problemsViewedCookieName("another"))).toBeUndefined();
  });
});
