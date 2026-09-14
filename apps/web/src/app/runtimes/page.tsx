import { api } from "@convex/_generated/api";
import { TitleRow } from "@moj/ui";
import { getTranslations } from "next-intl/server";
import { RuntimeTable } from "@/components/status/RuntimeTable";
import { statusTabs } from "@/components/status/StatusTabs";
import { queryAsViewer } from "@/lib/convex-server";
import { renderContent } from "@/lib/markdown";

export async function generateMetadata() {
  const t = await getTranslations("status.runtimes");
  return { title: t("title") };
}

export const dynamic = "force-dynamic";

export default async function RuntimesPage() {
  const t = await getTranslations("status.runtimes");
  const [languages, tabs] = await Promise.all([queryAsViewer(api.status.runtimes, {}), statusTabs()]);
  // The descriptions are markdown and `renderMarkdown` is async, so they are
  // rendered here rather than inside the table's map.
  const descriptions = Object.fromEntries(
    await Promise.all(
      languages.map(
        async (language) =>
          [language.key, await renderContent(language.description, language.descriptionPreset)] as const,
      ),
    ),
  );

  return (
    <>
      <TitleRow title={t("title")} tabs={tabs} active="runtimes" />
      <div id="content-body">
        <RuntimeTable languages={languages} descriptions={descriptions} />
      </div>
    </>
  );
}
