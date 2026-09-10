import { redirect } from "next/navigation";

/** DMOJ's `password_reset_confirm` URL, kept alive for links minted by the old
 *  site; the form lives at /accounts/reset/confirm/<token>/. */
export default async function PasswordResetConfirmAlias({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  redirect(`/accounts/reset/confirm/${token}/`);
}
