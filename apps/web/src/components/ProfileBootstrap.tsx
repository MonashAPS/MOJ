"use client";

import { api } from "@convex/_generated/api";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useEffect, useRef } from "react";
import { authClient } from "@/auth/client";

/** A Better Auth user exists before its Convex profile does: registration
 *  finishes without a session, so nothing can write to Convex as that user
 *  until they first sign in. The first authenticated page load creates the
 *  profile from the fields captured on the registration form. */
export function ProfileBootstrap() {
  const { isAuthenticated } = useConvexAuth();
  const viewer = useQuery(api.viewer.current, isAuthenticated ? {} : "skip");
  const ensureProfile = useMutation(api.profiles.ensureProfile);
  const { data: session } = authClient.useSession();
  const attempted = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || attempted.current) return;
    if (viewer === undefined || viewer.profile !== null) return;
    const user = session?.user as
      | { name?: string; username?: string; timezone?: string; preferredLanguage?: string }
      | undefined;
    if (!user) return;

    attempted.current = true;
    void ensureProfile({
      username: user.username ?? user.name ?? "user",
      timezone: user.timezone ?? undefined,
      languageKey: user.preferredLanguage ?? undefined,
    }).catch(() => {
      attempted.current = false;
    });
  }, [isAuthenticated, viewer, session, ensureProfile]);

  return null;
}
