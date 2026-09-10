import { requireAccount } from "@/auth/account-state";
import { ChangePasswordForm } from "./ChangePasswordForm";

export const metadata = { title: "Change password" };
export const dynamic = "force-dynamic";

export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ compromised?: string }>;
}) {
  const { compromised } = await searchParams;
  await requireAccount("/accounts/password/change/");
  return <ChangePasswordForm compromised={compromised === "1"} />;
}
