"use server";

import { cookies } from "next/headers";
import { problemsViewedCookieName } from "@/lib/problems-join-cover";

/** Read the HttpOnly preference when a navigation submit dialog opens. */
export async function readProblemsJoinCoverAcknowledgement(contestKey: string): Promise<boolean> {
  const jar = await cookies();

  return jar.get(problemsViewedCookieName(contestKey))?.value === "1";
}

/** A browser preference, not permission to access unreleased problems. */
export async function dismissProblemsJoinCover(contestKey: string): Promise<void> {
  const jar = await cookies();
  jar.set(problemsViewedCookieName(contestKey), "1", {
    path: `/contest/${encodeURIComponent(contestKey)}`,
    maxAge: 14 * 24 * 60 * 60,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
}
