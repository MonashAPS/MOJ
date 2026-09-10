import { api } from "@convex/_generated/api";
import { TitleRow } from "@moj/ui";
import { RuntimeTable } from "@/components/status/RuntimeTable";
import { STATUS_TABS } from "@/components/status/StatusTabs";
import { queryAsViewer } from "@/lib/convex-server";
import { renderContent } from "@/lib/markdown";

export const metadata = { title: "Runtimes" };
export const dynamic = "force-dynamic";

export default async function RuntimesPage() {
  const languages = await queryAsViewer(api.status.runtimes, {});
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
      <TitleRow title="Runtimes" tabs={STATUS_TABS} active="runtimes" />
      <div id="content-body">
        <RuntimeTable languages={languages} descriptions={descriptions} />
      </div>
    </>
  );
}
