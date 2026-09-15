"use client";

import { useEffect } from "react";
import { authClient } from "@/auth/client";

/**
 * Drops the client's cached session after the server has ended it.
 *
 * Logging out is a server action, so the redirect that follows is a client
 * navigation: React state survives it, including Better Auth's session store
 * and the Convex socket's authenticated subscriptions. Everything rendered on
 * the server came back logged out while anything reading Convex from the
 * browser — the contest box, most of all — carried on as though the session
 * were still live.
 */
export function SessionReset() {
  useEffect(() => {
    void authClient.signOut().catch(() => undefined);
  }, []);

  return null;
}
