import { Alert, AlertTitle, Button } from "@moj/ui";
import { LogOut } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getServerSession } from "@/auth/session";
import { AuthCard } from "@/components/auth/AuthCard";
import { logOut } from "./actions";

export async function generateMetadata() {
  const t = await getTranslations("auth.logout");

  return { title: t("metaTitle") };
}

export const dynamic = "force-dynamic";

export default async function LogoutPage({ searchParams }: { searchParams: Promise<{ done?: string }> }) {
  const { done } = await searchParams;
  const session = done ? null : await getServerSession();
  const t = await getTranslations("auth.logout");

  if (done || !session) {
    return (
      <AuthCard
        title={t("doneTitle")}
        subtitle={t("doneSubtitle")}
        footer={<span>{t.rich("doneFooter", { link: (chunks) => <Link href="/">{chunks}</Link> })}</span>}
      >
        <div className="grid gap-4">
          <Alert variant="success">
            <LogOut className="size-3.5" aria-hidden />
            <AlertTitle>{t("doneAlert")}</AlertTitle>
          </Alert>
          <Button asChild full>
            <Link href="/accounts/login/">{t("logBackIn")}</Link>
          </Button>
        </div>
      </AuthCard>
    );
  }

  const username = (session.user as { username?: string | null }).username || session.user.name;

  return (
    <AuthCard
      title={t("title")}
      subtitle={t("subtitle", { username })}
      footer={<span>{t.rich("footer", { link: (chunks) => <Link href="/">{chunks}</Link> })}</span>}
    >
      <form action={logOut} className="grid gap-2">
        <Button type="submit" full icon={<LogOut aria-hidden />}>
          {t("submit")}
        </Button>
        <Button asChild variant="ghost" full>
          <Link href="/">{t("stay")}</Link>
        </Button>
      </form>
    </AuthCard>
  );
}
