import Page from "@/app/problem/[code]/submissions/content";
import { requireContestProblem } from "@/lib/contest-resource.server";

export { generateMetadata } from "@/app/problem/[code]/submissions/content";

export const dynamic = "force-dynamic";

export default async function ContestPage(props: {
  params: Promise<{ key: string; code: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await props.params;
  await requireContestProblem(params.key, params.code);

  return <Page {...props} />;
}
