"use client";

import { api } from "@convex/_generated/api";
import { Panel } from "@moj/ui";
import { useQuery } from "convex/react";
import { Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatBytes } from "@/lib/format";

/**
 * The files a contest or a problem offers for download, as the public page
 * lists them. The query already answers only what this viewer may have, so an
 * empty answer renders nothing at all.
 */
export function ArtefactList({
  owner,
}: {
  owner: { kind: "contest"; key: string } | { kind: "problem"; code: string };
}) {
  const t = useTranslations("common.files");

  const files = useQuery(
    owner.kind === "contest" ? api.artefacts.forContest : api.artefacts.forProblem,
    owner.kind === "contest" ? { key: owner.key } : { code: owner.code },
  );

  if (!files || files.length === 0) return null;

  const base = owner.kind === "contest" ? `/contest/${owner.key}/files` : `/problem/${owner.code}/files`;

  return (
    <Panel title={t("title")} bodyClassName="p-0">
      <ul>
        {files.map((file) => (
          <li key={file.id} className="border-b border-border px-3 py-2 last:border-b-0">
            <a
              href={`${base}/${file.id}/${encodeURIComponent(file.name)}`}
              className="flex items-center justify-between gap-3 text-sm hover:text-link"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Download size={14} className="shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate">{file.name}</span>
              </span>
              <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                {formatBytes(file.size)}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
