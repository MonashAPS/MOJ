import { TitleRow } from "@moj/ui";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TicketsTable } from "./TicketsTable";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.tickets");

  return { title: t("metaTitle") };
}

export default async function AdminTicketsPage() {
  const t = await getTranslations("admin.tickets");

  return (
    <>
      <TitleRow title={t("title")} />
      <TicketsTable />
    </>
  );
}
