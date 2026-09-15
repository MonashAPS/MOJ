import { Alert, AlertTitle, Button } from "@moj/ui";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/auth/AuthCard";

export async function generateMetadata() {
  const t = await getTranslations("auth.passwordChangeDone");

  return { title: t("metaTitle") };
}

export default async function PasswordChangeDonePage() {
  const t = await getTranslations("auth.passwordChangeDone");

  return (
    <AuthCard
      title={t("title")}
      subtitle={t("subtitle")}
      footer={<span>{t.rich("footer", { link: (chunks) => <Link href="/problems/">{chunks}</Link> })}</span>}
    >
      <div className="grid gap-4">
        <Alert variant="success">
          <CheckCircle2 className="size-3.5" aria-hidden />
          <AlertTitle>{t("alert")}</AlertTitle>
        </Alert>
        <Button asChild full>
          <Link href="/edit/profile/">{t("backToProfile")}</Link>
        </Button>
      </div>
    </AuthCard>
  );
}
