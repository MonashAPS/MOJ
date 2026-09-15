import { TitleRow } from "@moj/ui";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { FlatPagesTable } from "./FlatPagesTable";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.flatpages");

  return { title: t("metaTitle") };
}

export default async function AdminFlatPagesPage() {
  const t = await getTranslations("admin.flatpages");

  return (
    <>
      <TitleRow title={t("title")} />
      <FlatPagesTable />
    </>
  );
}
