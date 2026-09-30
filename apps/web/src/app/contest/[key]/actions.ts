"use server";

import { cookies } from "next/headers";
import { problemsViewedCookieName } from "@/lib/problems-join-cover";

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
