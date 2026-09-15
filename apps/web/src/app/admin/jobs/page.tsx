import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { JobsList } from "./JobsList";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.jobs");

  return { title: t("metaTitle") };
}

export default function AdminJobsPage() {
  return (
    <Suspense fallback={null}>
      <JobsList />
    </Suspense>
  );
}
