import { getTranslations } from "next-intl/server";
import { type SearchParams, SubmissionListPage } from "@/components/submissions/SubmissionListPage";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  const t = await getTranslations("problems.detail");
  const { code } = await params;
  return { title: t("allSubmissionsFor", { code }) };
}

export default async function ProblemSubmissionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { code } = await params;
  return (
    <SubmissionListPage
      filters={{ problemCode: code }}
      showProblem={false}
      tab="all"
      bestSubmissionsHref={`/problem/${code}/rank/`}
      searchParams={await searchParams}
    />
  );
}
