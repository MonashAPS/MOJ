"use server";

import { api } from "@convex/_generated/api";
import { ConvexError } from "convex/values";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { mutateAsViewer } from "@/lib/convex-server";

export type JoinResult = { error: string } | never;

/** `convex/lib/errors.ts` throws `ConvexError({code, message})` and the join
 *  path adds a `reason`; a few throws carry the sentence on its own instead. */
type Refusal = { message?: string; reason?: string };

function isRefusalText(value: unknown): value is string {
  return typeof value === "string";
}

function isRefusal(value: unknown): value is Refusal {
  if (typeof value !== "object" || value === null) return false;

  if ("message" in value && typeof value.message !== "string") return false;

  return !("reason" in value) || typeof value.reason === "string";
}

function messageOf(cause: unknown, fallback: string): string {
  if (cause instanceof ConvexError) {
    if (isRefusalText(cause.data)) return cause.data;

    if (isRefusal(cause.data)) return cause.data.message ?? fallback;
  }

  return cause instanceof Error ? cause.message : fallback;
}

function reasonOf(cause: unknown): string | null {
  if (!(cause instanceof ConvexError) || !isRefusal(cause.data)) return null;

  return cause.data.reason || null;
}

/** `FormData.get` answers with a `File` for a file field and `null` for a field
 *  the form did not post; these forms only ever post text. */
function isText(value: FormDataEntryValue | null): value is string {
  return typeof value === "string";
}

function textField(formData: FormData, name: string): string {
  const value = formData.get(name);

  return isText(value) ? value : "";
}

/**
 * `ContestJoin.post` (contests.py:384): join, then land on the problem list —
 * which in contest mode is the contest's problems. A contest that wants an
 * access code sends the viewer to `/contest/[key]/join/` to type it, exactly as
 * DMOJ redirects back to `request.path`.
 */
export async function joinContest(_state: JoinResult | null, formData: FormData): Promise<JoinResult> {
  const t = await getTranslations("contests.actions");
  const key = textField(formData, "key");
  const accessCode = textField(formData, "accessCode");

  if (!key) return { error: t("noSuchContest") };

  try {
    await mutateAsViewer(api.contests.participation.join, {
      key,
      accessCode: accessCode || undefined,
    });
  } catch (error) {
    if (reasonOf(error) === "accessCodeRequired") {
      if (accessCode) return { error: t("invalidAccessCode") };
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
  const key = textField(formData, "key");

  if (!key) return { error: t("noSuchContest") };

  try {
    await mutateAsViewer(api.contests.participation.leave, { key });
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
  const key = textField(formData, "key");
  const newKey = textField(formData, "newKey").trim();

  if (!newKey) return { error: t("newKeyRequired") };

  try {
    await mutateAsViewer(api.contests.tools.clone, { key, newKey });
  } catch (error) {
    return { error: messageOf(error, t("cannotJoin")) };
  }

  redirect(`/admin/contests/${newKey}/`);
}
