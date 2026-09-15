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
  const clearStaleContest = useMutation(api.contests.clearStaleContest);
  const { data: session } = authClient.useSession();
  /** Keyed by the account, so signing in as somebody else tries again. */
  const attempted = useRef<string | null>(null);
  const clearedStale = useRef(false);

  /** `Profile.update_contest()`: a Convex query cannot drop a contest-mode
   *  participation whose window has closed, so `viewer.current` reports it as
   *  stale and the shell runs the mutation once. */
  useEffect(() => {
    if (!isAuthenticated || clearedStale.current) return;
    if (!viewer?.contestModeStale) return;
    clearedStale.current = true;
    void clearStaleContest({}).catch(() => {
      clearedStale.current = false;
    });
  }, [isAuthenticated, viewer, clearStaleContest]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (viewer === undefined || viewer.profile !== null) return;
    const user = session?.user as
      | { id?: string; name?: string; username?: string; timezone?: string; preferredLanguage?: string }
      | undefined;
    if (!user) return;
    const key = user.id ?? user.username ?? "user";
    if (attempted.current === key) return;

    attempted.current = key;
    void ensureProfile({
      username: user.username ?? user.name ?? "user",
      timezone: user.timezone ?? undefined,
      languageKey: user.preferredLanguage ?? undefined,
    }).catch(() => {
      attempted.current = null;
    });
  }, [isAuthenticated, viewer, session, ensureProfile]);

  return null;
}
