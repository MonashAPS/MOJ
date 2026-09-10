import { SubmissionListPage, type SearchParams } from "@/components/submissions/SubmissionListPage";

export const metadata = { title: "All submissions" };
export const dynamic = "force-dynamic";

export default async function AllSubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return <SubmissionListPage filters={{}} tab="all" searchParams={await searchParams} />;
}
