import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { ProblemsList } from "./ProblemsList";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.problems.list");
  return { title: t("metaTitle") };
}

export default function AdminProblemsPage() {
  return (
    <Suspense fallback={null}>
      <ProblemsList />
    </Suspense>
  );
}
