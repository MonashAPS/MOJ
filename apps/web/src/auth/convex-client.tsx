"use client";

import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { usePublicConfig } from "@/lib/public-config";
import { authClient } from "./client";

type AuthClient = typeof authClient;

type TokenAnswer = { data?: { token?: string } | null } | null;

type TokenAction = () => Promise<TokenAnswer>;

function hasTokenAction(client: AuthClient): client is AuthClient & { token: TokenAction } {
  return "token" in client && typeof client.token === "function";
}

/** The jwt plugin exposes GET /token. The client proxy generates
 *  `authClient.token()` from the server plugin, but fall back to a raw fetch so
 *  a plugin rename cannot silently log everyone out. */
async function fetchToken(): Promise<string | null> {
  try {
    if (hasTokenAction(authClient)) {
      const result = await authClient.token();
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
  const { convexUrl } = usePublicConfig();

  // The client holds the websocket, so it has to outlive a re-render; the
  // origin is fixed for the life of the document, so one instance is enough.
  const [client] = useState(() => new ConvexReactClient(convexUrl, { skipConvexDeploymentUrlCheck: true }));

  return (
    <ConvexProviderWithAuth client={client} useAuth={useBetterAuthForConvex}>
      {children}
    </ConvexProviderWithAuth>
  );
}
