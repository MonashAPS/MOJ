import {
  Alert,
  AlertDescription,
  AlertTitle,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  TitleRow,
} from "@moj/ui";
import { Info, MailCheck } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { recallLink } from "@/auth/mail";

export async function generateMetadata() {
  const t = await getTranslations("auth.registerComplete");
  return { title: t("metaTitle") };
}

export const dynamic = "force-dynamic";

export default async function RegistrationCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;
  // Never in production: outside it, mail goes to the server console and the
  // link is surfaced here so a new install can be finished without a mail server.
  const link = process.env.NODE_ENV !== "production" && email ? recallLink(email) : undefined;
  const t = await getTranslations("auth.registerComplete");
  const tMail = await getTranslations("auth.mail");

  return (
    <>
      <TitleRow title={t("title")} />
      <div id="content-body" className="grid max-w-(--prose-max) gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MailCheck className="size-4 text-subtle" aria-hidden />
              {t("checkEmail")}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-base text-subtle">
            <p>
              {email
                ? t.rich("sentToAddress", {
                    email,
                    strong: (chunks) => <strong className="font-medium text-foreground">{chunks}</strong>,
                  })
                : t("sentToYou")}
            </p>
            <p>
              {t.rich("nothingArrived", {
                link: (chunks) => <Link href="/accounts/register/">{chunks}</Link>,
              })}
            </p>
          </CardContent>
        </Card>

        {link ? (
          <Alert variant="info">
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
    </>
  );
}
