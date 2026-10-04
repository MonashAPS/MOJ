import Page from "@/app/submission/[id]/content";

export { generateMetadata } from "@/app/submission/[id]/content";

export const dynamic = "force-dynamic";

export default async function ContestPage(props: {
  params: Promise<{ key: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await props.params;

  return <Page {...props} browsingKey={params.key} />;
}
