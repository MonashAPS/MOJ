import { TitleRow } from "@moj/ui";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { UsersTable } from "./UsersTable";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.users.list");
  return { title: t("title") };
}

export default async function AdminUsersPage() {
  const t = await getTranslations("admin.users.list");

  return (
    <>
      <TitleRow title={t("title")} />
      <Suspense fallback={null}>
        <UsersTable />
      </Suspense>
    </>
  );
}
