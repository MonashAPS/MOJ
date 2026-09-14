"use server";

import { api } from "@convex/_generated/api";
import { ConvexError } from "convex/values";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { mutateAsViewer } from "@/lib/convex-server";

export type JoinResult = { error: string } | never;

function messageOf(error: unknown, fallback: string): string {
  if (error instanceof ConvexError) {
    const data = error.data as { message?: string; reason?: string } | string;
    if (typeof data === "string") return data;
    return data.message ?? fallback;
  }
  return error instanceof Error ? error.message : fallback;
}

function reasonOf(error: unknown): string | null {
  if (error instanceof ConvexError) {
    const data = error.data as { reason?: string } | string;
    if (typeof data === "object" && data.reason) return data.reason;
  }
  return null;
}

/**
 * `ContestJoin.post` (contests.py:384): join, then land on the problem list —
 * which in contest mode is the contest's problems. A contest that wants an
 * access code sends the viewer to `/contest/[key]/join/` to type it, exactly as
 * DMOJ redirects back to `request.path`.
 */
export async function joinContest(_state: JoinResult | null, formData: FormData): Promise<JoinResult> {
  const t = await getTranslations("contests.actions");
  const key = String(formData.get("key") ?? "");
  const accessCode = formData.get("accessCode");
  if (!key) return { error: t("noSuchContest") };

  try {
    await mutateAsViewer(api.contests.join, {
      key,
      accessCode: typeof accessCode === "string" && accessCode ? accessCode : undefined,
    });
  } catch (error) {
    if (reasonOf(error) === "accessCodeRequired") {
      if (typeof accessCode === "string" && accessCode) return { error: t("invalidAccessCode") };
      redirect(`/contest/${key}/join/`);
    }
    return { error: messageOf(error, t("cannotJoin")) };
  }

  revalidatePath("/contests");
  revalidatePath(`/contest/${key}`);
  redirect("/problems/");
}

/** `ContestLeave.post` (contests.py:468): back to the contest page. */
export async function leaveContest(_state: JoinResult | null, formData: FormData): Promise<JoinResult> {
  const t = await getTranslations("contests.actions");
  const key = String(formData.get("key") ?? "");
  if (!key) return { error: t("noSuchContest") };
  try {
    await mutateAsViewer(api.contests.leave, { key });
  } catch (error) {
    return { error: messageOf(error, t("cannotJoin")) };
  }
  revalidatePath(`/contest/${key}`);
  redirect(`/contest/${key}/`);
}

/** The same thing from a plain `<form action>`, which passes no prior state.
 *  The Safe Exam Browser screen uses it: it has no room for an error and every
 *  failure there is the contest already being over. */
export async function leaveContestForm(formData: FormData): Promise<void> {
  await leaveContest(null, formData);
}

export type CloneResult = { error: string } | never;

/** `ContestClone.form_valid` (contests.py:317): the clone opens in the admin. */
export async function cloneContest(_state: CloneResult | null, formData: FormData): Promise<CloneResult> {
  const t = await getTranslations("contests.actions");
  const key = String(formData.get("key") ?? "");
  const newKey = String(formData.get("newKey") ?? "").trim();
  if (!newKey) return { error: t("newKeyRequired") };
  try {
    await mutateAsViewer(api.contests.clone, { key, newKey });
  } catch (error) {
    return { error: messageOf(error, t("cannotJoin")) };
  }
  redirect(`/admin/contests/${newKey}/`);
}
