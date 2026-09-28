import { api } from "@convex/_generated/api";

import { getTranslations } from "next-intl/server";
import { TitleRow } from "@/components/shell/PageTabs";
import { statusTabs } from "@/components/status/StatusTabs";
import { queryAsViewer } from "@/lib/convex-server";
import { StatusTable } from "./StatusTable";

export async function generateMetadata() {
  const t = await getTranslations("status.judges");

  return { title: t("title") };
}

export const dynamic = "force-dynamic";

export default async function StatusPage() {
  const t = await getTranslations("status.judges");
  const [initial, tabs] = await Promise.all([queryAsViewer(api.status.page, {}), statusTabs()]);

  return (
    <>
      <TitleRow title={t("title")} tabs={tabs} active="judges" />
      <div id="content-body">
        <StatusTable initial={initial} />
      </div>
    </>
  );
}
