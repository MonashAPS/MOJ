import { TitleRow } from "@moj/ui";
import type { Metadata } from "next";
import { forbidden } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getServerSession } from "@/auth/session";
import { ProctorClient } from "@/components/proctor/ProctorClient";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.proctor");
  return { title: t("title") };
}

/**
 * Being proctored is a state the account is in, so this page belongs to the
 * account and not to any contest. Someone can open it with no contest running;
 * a contest that asks for proctoring simply checks whether they did.
 */
export default async function ProctorPage() {
  const t = await getTranslations("common.proctor");
  const session = await getServerSession().catch(() => null);
  if (!session) forbidden();

  return (
    <>
      <TitleRow title={t("title")} />
      <p className="mb-4 max-w-prose text-sm text-muted-foreground">{t("intro")}</p>
      <ProctorClient />
    </>
  );
}
