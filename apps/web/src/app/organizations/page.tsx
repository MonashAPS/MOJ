import { api } from "@convex/_generated/api";
import { TitleRow } from "@moj/ui";
import { getTranslations } from "next-intl/server";
import { userListTabs } from "@/components/users/tabs";
import { queryAsViewer } from "@/lib/convex-server";
import { OrganizationsTable } from "./OrganizationsTable";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("organizations.list");
  return { title: t("title") };
}

export default async function OrganizationsPage() {
  const t = await getTranslations("organizations.list");
  const [organizations, tabs] = await Promise.all([
    queryAsViewer(api.organizations.list, {}).catch(() => []),
    userListTabs(),
  ]);

  return (
    <>
      <TitleRow title={t("title")} tabs={tabs} active="organizations" />
      <div id="content-body">
        <OrganizationsTable initial={organizations} />
      </div>
    </>
  );
}
