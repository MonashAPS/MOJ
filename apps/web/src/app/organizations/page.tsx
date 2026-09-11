import { api } from "@convex/_generated/api";
import { TitleRow } from "@moj/ui";
import { USER_LIST_TABS } from "@/components/users/tabs";
import { queryAsViewer } from "@/lib/convex-server";
import { OrganizationsTable } from "./OrganizationsTable";

export const metadata = { title: "Organizations" };
export const dynamic = "force-dynamic";

export default async function OrganizationsPage() {
  const organizations = await queryAsViewer(api.organizations.list, {}).catch(() => []);

  return (
    <>
      <TitleRow title="Organizations" tabs={USER_LIST_TABS} active="organizations" />
      <div id="content-body">
        <OrganizationsTable initial={organizations} />
      </div>
    </>
  );
}
