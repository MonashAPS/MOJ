"use client";

import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { type ReactNode, useCallback, useMemo } from "react";
import { authClient } from "./client";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL ?? "http://127.0.0.1:3210";

let client: ConvexReactClient | undefined;
function getClient(): ConvexReactClient {
  if (!client) {
    client = new ConvexReactClient(convexUrl, { skipConvexDeploymentUrlCheck: true });
  }
  return client;
}

type TokenAction = (options?: unknown) => Promise<{ data?: { token?: string } | null } | null>;

/** The jwt plugin exposes GET /token. The client proxy generates
 *  `authClient.token()` from the server plugin, but fall back to a raw fetch so
 *  a plugin rename cannot silently log everyone out. */
async function fetchToken(): Promise<string | null> {
  const candidate = (authClient as unknown as { token?: TokenAction }).token;
  try {
    if (typeof candidate === "function") {
      const result = await candidate();
      const token = result?.data?.token;
      if (token) return token;
    }
    const response = await authClient.$fetch<{ token?: string }>("/token", { method: "GET" });
    return response.data?.token ?? null;
  } catch {
    return null;
  }
}

function useBetterAuthForConvex() {
  const { data: session, isPending } = authClient.useSession();

  const fetchAccessToken = useCallback(
    async (_options: { forceRefreshToken: boolean }): Promise<string | null> => {
      if (!session) return null;
      return await fetchToken();
    },
    [session],
  );

  return useMemo(
    () => ({
      isLoading: isPending,
      isAuthenticated: session !== null && session !== undefined,
      fetchAccessToken,
    }),
    [isPending, session, fetchAccessToken],
  );
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexProviderWithAuth client={getClient()} useAuth={useBetterAuthForConvex}>
      {children}
    </ConvexProviderWithAuth>
  );
}
