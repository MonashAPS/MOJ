import { Panel } from "@moj/ui";
import { formatDateTime } from "@/lib/format";

export type RevisionRow = {
  _id: string;
  createdAt: number;
  reason: string;
  author: string | null;
};

/**
 * The history a `revisions` row is written for on every console edit: who
 * changed the object, when, and the reason they gave. Part 1 owns the
 * canonical version of this file.
 */
export function RevisionsPanel({
  rows,
  title = "History",
  emptyText = "No changes have been recorded for this yet.",
}: {
  rows: RevisionRow[] | null;
  title?: string;
  emptyText?: string;
}) {
  return (
    <Panel title={title} bodyClassName="p-0">
      {rows === null || rows.length === 0 ? (
        <p className="p-3 text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ol className="grid">
          {rows.map((row) => (
            <li key={row._id} className="grid gap-0.5 border-b border-border px-3 py-2 last:border-b-0">
              <span className="text-base text-foreground">{row.reason}</span>
              <span className="text-sm text-muted-foreground">
                <span className="font-mono text-mono tabular-nums">{formatDateTime(row.createdAt)}</span>
                {row.author ? ` · ${row.author}` : ""}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
