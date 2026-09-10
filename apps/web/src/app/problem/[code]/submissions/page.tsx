import { SubmissionListPage, type SearchParams } from "@/components/submissions/SubmissionListPage";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return { title: `All submissions for ${code}` };
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
