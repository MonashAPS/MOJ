import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TitleRow } from "@/components/shell/PageTabs";
import { OrganizationsTable } from "./OrganizationsTable";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.organizations.list");

  return { title: t("title") };
}

export default async function AdminOrganizationsPage() {
  const t = await getTranslations("admin.organizations.list");

  return (
    <>
      <TitleRow title={t("title")} />
      <OrganizationsTable />
    </>
  );
}
