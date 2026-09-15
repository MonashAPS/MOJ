"use server";

import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { DISPOSABLE_EMAIL_KEY } from "@/auth/disposable-email";
import { auth } from "@/auth/server";
import { authErrorMessage, authErrorStatus } from "@/lib/auth-error";

export type EmailChangeResult =
  | { ok: true }
  | { ok: false; field: "password" | "email" | "form"; message: string };

/** DMOJ asks for the password before it will move an account to a new address.
 *  Better Auth's `verifyPassword` is server-only, so the check runs here rather
 *  than as a second sign-in from the browser, which would disturb the session. */
export async function requestEmailChange(input: {
  password: string;
  newEmail: string;
}): Promise<EmailChangeResult> {
  const requestHeaders = await headers();
  const t = await getTranslations("auth.emailChange");
  const tError = await getTranslations("auth.errors");
  const tPassword = await getTranslations("auth.password");

  try {
    await auth.api.verifyPassword({ headers: requestHeaders, body: { password: input.password } });
  } catch (error) {
    if (authErrorStatus(error) === 401) return { ok: false, field: "form", message: t("reauth") };

    return { ok: false, field: "password", message: tPassword("wrong") };
  }

  try {
    await auth.api.changeEmail({ headers: requestHeaders, body: { newEmail: input.newEmail } });

    return { ok: true };
  } catch (error) {
    const status = authErrorStatus(error);
    const message = authErrorMessage(error);

    if (status === 429) {
      return { ok: false, field: "form", message: t("tooMany") };
    }

    if (message === DISPOSABLE_EMAIL_KEY) {
      return { ok: false, field: "email", message: tError(DISPOSABLE_EMAIL_KEY) };
    }

    return { ok: false, field: "email", message: message ?? t("addressUnusable") };
  }
}
