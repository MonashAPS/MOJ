import { api } from "@convex/_generated/api";
import {
  ContentDescription,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TitleRow,
} from "@moj/ui";
import { Code2 } from "lucide-react";
import { STATUS_TABS } from "@/components/status/StatusTabs";
import { queryAsViewer } from "@/lib/convex-server";
import { renderContent } from "@/lib/markdown";
import { DASH } from "@/lib/submissionFormat";

export const metadata = { title: "Runtimes" };
export const dynamic = "force-dynamic";

/** `runtime_versions(info)` (judge/jinja2/runtime.py): `name version, name version`. */
function versionText(versions: Array<{ name: string; versions: string[] }>): string {
  const parts = versions.map((entry) =>
    entry.versions.length > 0 ? `${entry.name} ${entry.versions.join(", ")}` : entry.name,
  );
  return parts.join(", ");
}

export default async function RuntimesPage() {
  const languages = await queryAsViewer(api.status.runtimes, {});
  // The descriptions are markdown, and `renderMarkdown` is async, so they are
  // rendered here rather than inside the map below.
  const descriptions = new Map(
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
        {languages.length === 0 ? (
          <EmptyState
            icon={<Code2 aria-hidden />}
            title="No runtimes"
            description="No judges are online, so the judge does not know what it can run."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Runtime info</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {languages.map((language) => (
                <TableRow key={language.key}>
                  <TableCell className="whitespace-nowrap font-mono text-mono font-medium text-foreground">
                    {language.shortName}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{language.name}</TableCell>
                  <TableCell className="w-full">
                    <code className="font-mono text-mono text-subtle">
                      {versionText(language.versions) || DASH}
                    </code>
                    {descriptions.get(language.key) ? (
                      <ContentDescription
                        className="mt-1 text-sm"
                        html={descriptions.get(language.key) ?? ""}
                      />
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </>
  );
}
