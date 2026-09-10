import type { RuntimeListEntry } from "@convex/status";
import {
  ContentDescription,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@moj/ui";
import { Code2 } from "lucide-react";
import { DASH } from "@/lib/submissionFormat";

/** `runtime_versions(info)` (judge/jinja2/runtime.py): `name version, name version`. */
export function versionText(versions: Array<{ name: string; versions: string[] }>): string {
  return versions
    .map((entry) => (entry.versions.length > 0 ? `${entry.name} ${entry.versions.join(", ")}` : entry.name))
    .join(", ");
}

/** `status/language-list.html`. The descriptions arrive as rendered HTML because
 *  `renderMarkdown` is async and belongs on the server. */
export function RuntimeTable({
  languages,
  descriptions,
}: {
  languages: RuntimeListEntry[];
  descriptions: Record<string, string>;
}) {
  if (languages.length === 0) {
    return (
      <EmptyState
        icon={<Code2 aria-hidden />}
        title="No runtimes"
        description="No judges are online, so the judge does not know what it can run."
      />
    );
  }

  return (
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
              {descriptions[language.key] ? (
                <ContentDescription className="mt-1 text-sm" html={descriptions[language.key] ?? ""} />
              ) : null}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
