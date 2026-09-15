import { api } from "@convex/_generated/api";
import { TitleRow } from "@moj/ui";
import { getTranslations } from "next-intl/server";
import { statusTabs } from "@/components/status/StatusTabs";
import { VersionMatrix } from "@/components/status/VersionMatrix";
import { queryAsViewer } from "@/lib/convex-server";

export async function generateMetadata() {
  const t = await getTranslations("status.matrix");

  return { title: t("title") };
}

export const dynamic = "force-dynamic";

export default async function VersionMatrixPage() {
  const t = await getTranslations("status.matrix");
  const [matrix, tabs] = await Promise.all([queryAsViewer(api.status.matrix, {}), statusTabs()]);

  return (
    <>
      <TitleRow title={t("title")} tabs={tabs} active="matrix" />
      <div id="content-body">
        <VersionMatrix matrix={matrix} />
      </div>
    </>
  );
}
