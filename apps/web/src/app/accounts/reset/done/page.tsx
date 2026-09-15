import { Alert, AlertDescription, AlertTitle } from "@moj/ui";
import { Info, MailCheck } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { recallLink } from "@/auth/mail";
import { AuthCard } from "@/components/auth/AuthCard";

export async function generateMetadata() {
  const t = await getTranslations("auth.resetDone");

  return { title: t("metaTitle") };
}

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
  const t = await getTranslations("auth.resetDone");
  const tMail = await getTranslations("auth.mail");

  return (
    <AuthCard
      title={t("title")}
      subtitle={t("subtitle")}
      footer={
        <span>{t.rich("footer", { link: (chunks) => <Link href="/accounts/login/">{chunks}</Link> })}</span>
      }
    >
      <div className="grid gap-4">
        <Alert variant="info">
          <MailCheck className="size-3.5" aria-hidden />
          <AlertTitle>{t("alertTitle")}</AlertTitle>
          <AlertDescription>{t("alertDescription")}</AlertDescription>
        </Alert>

        {link?.kind === "reset" ? (
          <Alert variant="warning">
            <Info className="size-3.5" aria-hidden />
            <AlertTitle>{tMail("notConfigured")}</AlertTitle>
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
