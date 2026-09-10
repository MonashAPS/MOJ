import { redirect } from "next/navigation";

/** DMOJ's `password_reset_complete` URL, kept alive. */
export default function PasswordResetCompleteAlias() {
  redirect("/accounts/reset/complete/");
}
