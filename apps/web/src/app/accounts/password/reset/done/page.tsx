import { redirect } from "next/navigation";

/** DMOJ's `password_reset_done` URL, kept alive; the page itself lives at
 *  /accounts/reset/done/. */
export default function PasswordResetDoneAlias() {
  redirect("/accounts/reset/done/");
}
