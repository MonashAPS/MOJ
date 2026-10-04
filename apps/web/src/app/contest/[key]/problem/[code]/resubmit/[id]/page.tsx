import Page from "@/app/problem/[code]/resubmit/[id]/content";

export { generateMetadata } from "@/app/problem/[code]/resubmit/[id]/content";

export const dynamic = "force-dynamic";

export default async function ContestPage(props: {
  params: Promise<{ key: string; code: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await props.params;

  return <Page {...props} browsingKey={params.key} />;
}
