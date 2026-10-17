import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { ReviewQueue } from "./ReviewQueue";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.review");

  return { title: t("metaTitle") };
}

export default function AdminReviewPage() {
  return (
    <Suspense fallback={null}>
      <ReviewQueue />
    </Suspense>
  );
}
