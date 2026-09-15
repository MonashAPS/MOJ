import { TitleRow } from "@moj/ui";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LanguagesTable } from "./LanguagesTable";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.languages");

  return { title: t("metaTitle") };
}

export default async function AdminLanguagesPage() {
  const t = await getTranslations("admin.languages");

  return (
    <>
      <TitleRow title={t("title")} />
      <LanguagesTable />
    </>
  );
}
