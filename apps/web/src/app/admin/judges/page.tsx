import { TitleRow } from "@moj/ui";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { appUrl } from "@/lib/public-config.server";
import { JudgesTable } from "./JudgesTable";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.judges");

  return { title: t("metaTitle") };
}

export default async function AdminJudgesPage() {
  const t = await getTranslations("admin.judges");
  const siteUrl = appUrl();

  return (
    <>
      <TitleRow title={t("title")} />
      <JudgesTable siteUrl={siteUrl} />
    </>
  );
}
