import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { SubmissionsAdmin } from "./SubmissionsAdmin";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.submissions");
  return { title: t("metaTitle") };
}

export default function AdminSubmissionsPage() {
  return (
    <Suspense fallback={null}>
      <SubmissionsAdmin />
    </Suspense>
  );
}
