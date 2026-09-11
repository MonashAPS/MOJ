import { api } from "@convex/_generated/api";
import { TitleRow } from "@moj/ui";
import { STATUS_TABS } from "@/components/status/StatusTabs";
import { queryAsViewer } from "@/lib/convex-server";
import { StatusTable } from "./StatusTable";

export const metadata = { title: "Status" };
export const dynamic = "force-dynamic";

export default async function StatusPage() {
  const initial = await queryAsViewer(api.status.page, {});
  return (
    <>
      <TitleRow title="Status" tabs={STATUS_TABS} active="judges" />
      <div id="content-body">
        <StatusTable initial={initial} />
      </div>
    </>
  );
}
