import { Alert, AlertDescription, AlertTitle } from "@moj/ui";
import { Info, MailCheck } from "lucide-react";
import Link from "next/link";
import { recallLink } from "@/auth/mail";
import { AuthCard } from "@/components/auth/AuthCard";

export const metadata = { title: "Reset email sent" };
export const dynamic = "force-dynamic";

export default async function PasswordResetDonePage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;
  // Never in production: outside it, mail goes to the server console and the
  // link is surfaced here so a fresh install can be finished without a mail server.
  const link = process.env.NODE_ENV !== "production" && email ? recallLink(email) : undefined;

  return (
    <AuthCard
      title="Check your email"
      subtitle="If that address has an account, a reset link is on its way."
      footer={
        <span>
          Back to <Link href="/accounts/login/">logging in</Link>
        </span>
      }
    >
      <div className="grid gap-4">
        <Alert variant="info">
          <MailCheck className="size-3.5" aria-hidden />
          <AlertTitle>We have emailed you instructions for setting your password.</AlertTitle>
          <AlertDescription>
            Nothing after a few minutes? Check your spam folder, and make sure you used the address you
            registered with.
          </AlertDescription>
        </Alert>

        {link?.kind === "reset" ? (
          <Alert variant="warning">
            <Info className="size-3.5" aria-hidden />
            <AlertTitle>Mail is not configured on this install</AlertTitle>
            <AlertDescription>
              <a href={link.url} className="break-all font-mono text-mono">
                {link.url}
              </a>
            </AlertDescription>
          </Alert>
        ) : null}
      </div>
    </AuthCard>
  );
}
