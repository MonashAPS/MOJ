"use server";

import { api } from "@convex/_generated/api";
import { ConvexError } from "convex/values";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { mutateAsViewer } from "@/lib/convex-server";

export type JoinResult = { error: string } | { alreadyIn: string } | never;

/** `convex/lib/errors.ts` throws `ConvexError({code, message})` and the join
 *  path adds a `reason`; a few throws carry the sentence on its own instead. */
type Refusal = { message?: string; reason?: string; contestName?: string };

function isRefusalText(value: unknown): value is string {
  return typeof value === "string";
}

function isRefusal(value: unknown): value is Refusal {
  if (typeof value !== "object" || value === null) return false;

  if ("message" in value && typeof value.message !== "string") return false;

  if ("contestName" in value && typeof value.contestName !== "string") return false;

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

/** The contest named by an `alreadyInContest` refusal, for the switch dialog. */
function contestNameOf(cause: unknown): string {
  if (!(cause instanceof ConvexError) || !isRefusal(cause.data)) return "";

  return cause.data.contestName ?? "";
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
  const confirmSwitch = textField(formData, "confirmSwitch") === "1";

  if (!key) return { error: t("noSuchContest") };

  try {
    await mutateAsViewer(api.contests.participation.join, {
      key,
      accessCode: accessCode || undefined,
      confirmSwitch: confirmSwitch || undefined,
    });
  } catch (error) {
    if (reasonOf(error) === "accessCodeRequired") {
      if (accessCode) return { error: t("invalidAccessCode") };
      redirect(`/contest/${key}/join/`);
    }

    // Not a refusal: the viewer is in another contest and has not been asked yet.
    if (reasonOf(error) === "alreadyInContest") {
      return { alreadyIn: contestNameOf(error) };
    }

    return { error: messageOf(error, t("cannotJoin")) };
  }

  revalidatePath("/contests");
  revalidatePath(`/contest/${key}`);
  // The contest's own page, not the problems list: the problems list is the
  // catalogue again, and a contestant who just joined wants the contest.
  redirect(`/contest/${key}/`);
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
