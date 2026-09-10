"use server";

import { headers } from "next/headers";
import { auth } from "@/auth/server";

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

  try {
    await auth.api.verifyPassword({ headers: requestHeaders, body: { password: input.password } });
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 401) return { ok: false, field: "form", message: "Log in again to change your email." };
    return { ok: false, field: "password", message: "That password is not right." };
  }

  try {
    await auth.api.changeEmail({ headers: requestHeaders, body: { newEmail: input.newEmail } });
    return { ok: true };
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    const message = (error as { body?: { message?: string } }).body?.message;
    if (status === 429) {
      return {
        ok: false,
        field: "form",
        message: "You have asked for too many changes. Wait a minute and try again.",
      };
    }
    return { ok: false, field: "email", message: message ?? "That address could not be used." };
  }
}
