import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { ContestsList } from "./ContestsList";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.contests.list");

  return { title: t("metaTitle") };
}

export default function AdminContestsPage() {
  return (
    <Suspense fallback={null}>
      <ContestsList />
    </Suspense>
  );
}
