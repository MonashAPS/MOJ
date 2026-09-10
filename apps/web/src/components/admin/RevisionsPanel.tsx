"use client";

import { cn, EmptyState, Panel, Select } from "@moj/ui";
import { History } from "lucide-react";
import { useMemo, useState } from "react";
import { formatDateTime, formatRelative } from "@/lib/format";

export type Revision = {
  id: string;
  createdAt: number;
  reason: string;
  author: string | null;
  snapshot: unknown;
};

type Change = { field: string; before: string; after: string };

function render(value: unknown): string {
  if (value === undefined || value === null) return "—";
  if (Array.isArray(value)) return value.length === 0 ? "—" : value.map(render).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "yes" : "no";
  return String(value);
}

function asRecord(snapshot: unknown): Record<string, unknown> {
  return snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
    ? (snapshot as Record<string, unknown>)
    : {};
}

/** Field-by-field, both ways: what a snapshot gained, lost or changed. */
function diff(before: unknown, after: unknown): Change[] {
  const left = asRecord(before);
  const right = asRecord(after);
  const fields = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  const changes: Change[] = [];
  for (const field of fields) {
    const a = render(left[field]);
    const b = render(right[field]);
    if (a !== b) changes.push({ field, before: a, after: b });
  }
  return changes;
}

const LABELS: Record<string, string> = {
  isPublic: "Public",
  isManuallyManaged: "Manually managed",
  isOrganizationPrivate: "Organisation private",
  isFullMarkup: "Full markup",
  submissionSourceVisibility: "Submission source visibility",
  timeLimit: "Time limit",
  memoryLimit: "Memory limit",
  shortCircuit: "Short circuit",
  allowedLanguages: "Allowed languages",
  languageLimits: "Language limits",
  bannedUsers: "Banned users",
  ogImage: "Social image",
  startTime: "Start",
  endTime: "End",
  isVisible: "Visible",
  isRated: "Rated",
  formatName: "Format",
  formatConfig: "Format configuration",
  freezeMinutes: "Freeze",
  blindDuringFreeze: "Blind during freeze",
  lockedAfter: "Locked after",
  pointsPrecision: "Points precision",
};

function label(field: string): string {
  if (LABELS[field]) return LABELS[field];
  const spaced = field.replace(/([A-Z])/g, " $1").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * The revision history SPEC section 8 asks every edit form to write. The server
 * stores whole snapshots and never a diff, so any two of them can be compared.
 */
export function RevisionsPanel({
  revisions,
  loading = false,
  emptyDescription = "Every edit made here is recorded with the reason it was made.",
  className,
}: {
  revisions: Revision[] | undefined;
  loading?: boolean;
  emptyDescription?: string;
  className?: string;
}) {
  const rows = revisions ?? [];
  const [leftId, setLeftId] = useState<string | null>(null);
  const [rightId, setRightId] = useState<string | null>(null);

  const left = rows.find((row) => row.id === leftId) ?? rows[1] ?? null;
  const right = rows.find((row) => row.id === rightId) ?? rows[0] ?? null;
  const changes = useMemo(() => (left && right ? diff(left.snapshot, right.snapshot) : []), [left, right]);

  if (loading) {
    return (
      <Panel title="Revisions" className={className} bodyClassName="p-4">
        <p className="text-sm text-muted-foreground">Loading the history…</p>
      </Panel>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        className={className}
        icon={<History aria-hidden />}
        title="No revisions yet"
        description={emptyDescription}
      />
    );
  }

  const options = rows.map((row) => ({
    value: row.id,
    label: `${formatDateTime(row.createdAt)} — ${row.author ?? "system"}`,
  }));

  return (
    <div className={cn("grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]", className)}>
      <Panel title={`History (${rows.length})`} bodyClassName="p-0">
        <ol className="divide-y divide-border">
          {rows.map((row) => (
            <li key={row.id}>
              <div
                className={cn(
                  "grid gap-0.5 px-3 py-2",
                  (row.id === left?.id || row.id === right?.id) && "bg-row-selected",
                )}
              >
                <span className="truncate text-base text-foreground">{row.reason}</span>
                <span className="font-mono text-sm tabular-nums text-muted-foreground">
                  {row.author ?? "system"} ·{" "}
                  <time
                    dateTime={new Date(row.createdAt).toISOString()}
                    title={formatDateTime(row.createdAt)}
                  >
                    {formatRelative(row.createdAt)}
                  </time>
                </span>
              </div>
            </li>
          ))}
        </ol>
      </Panel>

      <Panel title="Compare" bodyClassName="p-4">
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1">
            <span className="font-sans text-xs font-semibold uppercase tracking-label text-muted-foreground">
              From
            </span>
            <Select
              size="sm"
              ariaLabel="Older revision"
              options={options}
              value={left?.id}
              onValueChange={setLeftId}
            />
          </div>
          <div className="grid gap-1">
            <span className="font-sans text-xs font-semibold uppercase tracking-label text-muted-foreground">
              To
            </span>
            <Select
              size="sm"
              ariaLabel="Newer revision"
              options={options}
              value={right?.id}
              onValueChange={setRightId}
            />
          </div>
        </div>

        {rows.length < 2 ? (
          <p className="text-sm text-muted-foreground">
            There is one revision so far, so there is nothing to compare it with.
          </p>
        ) : changes.length === 0 ? (
          <p className="text-sm text-muted-foreground">These two revisions are identical.</p>
        ) : (
          <dl className="grid gap-0 overflow-hidden rounded-md border border-border">
            {changes.map((change) => (
              <div
                key={change.field}
                className="grid grid-cols-[minmax(0,180px)_minmax(0,1fr)] gap-3 border-b border-border px-3 py-2 last:border-b-0"
              >
                <dt className="truncate text-base font-medium text-subtle">{label(change.field)}</dt>
                <dd className="grid gap-1 text-base">
                  <span className="break-words text-danger-ink line-through decoration-danger-line">
                    {change.before}
                  </span>
                  <span className="break-words text-success-ink">{change.after}</span>
                </dd>
              </div>
            ))}
          </dl>
        )}
      </Panel>
    </div>
  );
}
