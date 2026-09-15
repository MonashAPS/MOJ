import { getTranslations } from "next-intl/server";
import { type SearchParams, SubmissionListPage } from "@/components/submissions/SubmissionListPage";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("submissions.meta");

  return { title: t("all") };
}

export default async function AllSubmissionsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return <SubmissionListPage filters={{}} tab="all" searchParams={await searchParams} />;
}
