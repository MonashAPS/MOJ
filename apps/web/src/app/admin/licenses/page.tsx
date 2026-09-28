import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TitleRow } from "@/components/shell/PageTabs";
import { LicensesTable } from "./LicensesTable";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.licenses");

  return { title: t("metaTitle") };
}

export default async function AdminLicensesPage() {
  const t = await getTranslations("admin.licenses");

  return (
    <>
      <TitleRow title={t("title")} />
      <LicensesTable />
    </>
  );
}
