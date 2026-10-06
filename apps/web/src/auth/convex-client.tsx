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
  const userId = session?.user.id ?? null;

  // Keyed on who is signed in rather than on the session object. Convex tears
  // its authentication down and rebuilds it whenever this function changes,
  // which drops every live page back to the server's answer for a moment; a
  // session refresh that only moves the expiry must not do that.
  const fetchAccessToken = useCallback(
    async (_options: { forceRefreshToken: boolean }): Promise<string | null> => {
      if (!userId) return null;

      return await fetchToken();
    },
    [userId],
  );

  return useMemo(
    () => ({
      isLoading: isPending,
      isAuthenticated: userId !== null,
      fetchAccessToken,
    }),
    [isPending, userId, fetchAccessToken],
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
