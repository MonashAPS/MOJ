import { TitleRow } from "@moj/ui";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TagsTable } from "./TagsTable";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.tags");

  return { title: t("metaTitle") };
}

export default async function AdminTagsPage() {
  const t = await getTranslations("admin.tags");

  return (
    <>
      <TitleRow title={t("title")} />
      <TagsTable />
    </>
  );
}
