import { TitleRow } from "@moj/ui";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { NavigationEditor } from "./NavigationEditor";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.navigation");

  return { title: t("metaTitle") };
}

export default async function AdminNavigationPage() {
  const t = await getTranslations("admin.navigation");

  return (
    <>
      <TitleRow title={t("title")} />
      <NavigationEditor />
    </>
  );
}
