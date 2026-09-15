import { TitleRow } from "@moj/ui";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { JudgesTable } from "./JudgesTable";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.judges");
  return { title: t("metaTitle") };
}

export default async function AdminJudgesPage() {
  const t = await getTranslations("admin.judges");
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return (
    <>
      <TitleRow title={t("title")} />
      <JudgesTable siteUrl={siteUrl} />
    </>
  );
}
