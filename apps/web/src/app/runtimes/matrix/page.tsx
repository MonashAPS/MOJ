import { api } from "@convex/_generated/api";
import { TitleRow } from "@moj/ui";
import { STATUS_TABS } from "@/components/status/StatusTabs";
import { VersionMatrix } from "@/components/status/VersionMatrix";
import { queryAsViewer } from "@/lib/convex-server";

export const metadata = { title: "Version matrix" };
export const dynamic = "force-dynamic";

export default async function VersionMatrixPage() {
  const matrix = await queryAsViewer(api.status.matrix, {});
  return (
    <>
      <TitleRow title="Version matrix" tabs={STATUS_TABS} active="matrix" />
      <div id="content-body">
        <VersionMatrix matrix={matrix} />
      </div>
    </>
  );
}
