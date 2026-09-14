import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { ProctorSessions } from "./ProctorSessions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.proctor");
  return { title: t("title") };
}

export default function AdminProctorPage() {
  return (
    <Suspense fallback={null}>
      <ProctorSessions />
    </Suspense>
  );
}
