import { TitleRow } from "@moj/ui";
import { Comments } from "@/components/comments/Comments";

export const dynamic = "force-dynamic";

/** TEMPORARY: stands in for the problem page while that branch is built, so the
 *  comment section can be reviewed against real data. Delete before merging. */
export default async function DevComments({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return (
    <>
      <TitleRow title={code} />
      <div id="content-body">
        <Comments targetType="problem" targetKey={code} />
      </div>
    </>
  );
}
