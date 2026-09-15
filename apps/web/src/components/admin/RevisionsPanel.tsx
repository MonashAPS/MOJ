"use client";

import { cn, EmptyState, Panel, Select } from "@moj/ui";
import { History } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { formatDateTime, formatRelative } from "@/lib/format";

type Revision = {
  id: string;
  createdAt: number;
  reason: string;
  author: string | null;
  snapshot: unknown;
};

/** The same row straight off a Convex query, where the id is `_id` and a
 *  section that stores no snapshot leaves it out. */
export type RevisionRow = {
  _id: string;
  createdAt: number;
  reason: string;
  author: string | null;
  snapshot?: unknown;
};

type Change = { field: string; before: string; after: string };

/** What a boolean field reads as in the diff. The rendering runs outside the
 *  component, where there is no hook to reach the catalogue, so the two words
 *  are handed down instead. */
type BooleanWords = { yes: string; no: string };

/** A snapshot is whatever JSON the section wrote, so the diff walks JSON values. */
type JsonObject = { [field: string]: JsonValue };

type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;

/** Only an object snapshot has fields to compare; anything else diffs as empty. */
function isSnapshotObject(snapshot: unknown): snapshot is JsonObject {
  return typeof snapshot === "object" && snapshot !== null && !Array.isArray(snapshot);
}

function isNestedObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function render(value: JsonValue | undefined, words: BooleanWords): string {
  if (value === undefined || value === null) return "—";

  if (Array.isArray(value))
    return value.length === 0 ? "—" : value.map((entry) => render(entry, words)).join(", ");

  if (isNestedObject(value)) return JSON.stringify(value);

  if (value === true || value === false) return value ? words.yes : words.no;

  return String(value);
}

/** Field-by-field, both ways: what a snapshot gained, lost or changed. */
function diff(before: Revision, after: Revision, words: BooleanWords): Change[] {
  const left: JsonObject = isSnapshotObject(before.snapshot) ? before.snapshot : {};
  const right: JsonObject = isSnapshotObject(after.snapshot) ? after.snapshot : {};
  const fields = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  const changes: Change[] = [];

  for (const field of fields) {
    const a = render(left[field], words);
    const b = render(right[field], words);

    if (a !== b) changes.push({ field, before: a, after: b });
  }

  return changes;
}

/** A field the catalogue has no name for, spelled out from its camelCase one. */
function fallbackLabel(field: string): string {
  const spaced = field.replace(/([A-Z])/g, " $1").toLowerCase();

  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * The revision history SPEC section 8 asks every edit form to write. The server
 * stores whole snapshots and never a diff, so any two of them can be compared.
 */
export function RevisionsPanel({
  revisions,
  rows: rawRows,
  title,
  loading = false,
  emptyText,
  emptyDescription,
  className,
}: {
  revisions?: Revision[] | undefined;
  /** Convex rows, keyed by `_id`, for the sections that pass the query through. */
  rows?: RevisionRow[] | null;
  title?: string;
  loading?: boolean;
  emptyText?: string;
  emptyDescription?: string;
  className?: string;
}) {
  const t = useTranslations("admin.components.revisions");
  const pending = loading || (revisions === undefined && rawRows == null);

  const rows: Revision[] =
    revisions ??
    (rawRows ?? []).map((row) => ({
      id: row._id,
      createdAt: row.createdAt,
      reason: row.reason,
      author: row.author,
      snapshot: row.snapshot,
    }));

  const [leftId, setLeftId] = useState<string | null>(null);
  const [rightId, setRightId] = useState<string | null>(null);

  const left = rows.find((row) => row.id === leftId) ?? rows[1] ?? null;
  const right = rows.find((row) => row.id === rightId) ?? rows[0] ?? null;
  const words = useMemo(() => ({ yes: t("booleanTrue"), no: t("booleanFalse") }), [t]);

  const changes = useMemo(() => (left && right ? diff(left, right, words) : []), [left, right, words]);

  const panelTitle = title ?? t("title");

  function fieldLabel(field: string): string {
    return t.has(`fields.${field}`) ? t(`fields.${field}`) : fallbackLabel(field);
  }

  if (pending) {
    return (
      <Panel title={panelTitle} className={className} bodyClassName="p-4">
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      </Panel>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        className={className}
        icon={<History aria-hidden />}
        title={t("emptyTitle")}
        description={emptyText ?? emptyDescription ?? t("emptyDescription")}
      />
    );
  }

  const options = rows.map((row) => ({
    value: row.id,
    label: t("option", {
      when: formatDateTime(row.createdAt),
      author: row.author ?? t("systemAuthor"),
    }),
  }));

  return (
    <div className={cn("grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]", className)}>
      <Panel title={t("titleCount", { title: panelTitle, count: rows.length })} bodyClassName="p-0">
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
                  {row.author ?? t("systemAuthor")} ·{" "}
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

      <Panel title={t("compare")} bodyClassName="p-4">
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1">
            <span className="font-sans text-xs font-semibold uppercase tracking-label text-muted-foreground">
              {t("from")}
            </span>
            <Select
              size="sm"
              ariaLabel={t("olderRevision")}
              options={options}
              value={left?.id}
              onValueChange={setLeftId}
            />
          </div>
          <div className="grid gap-1">
            <span className="font-sans text-xs font-semibold uppercase tracking-label text-muted-foreground">
              {t("to")}
            </span>
            <Select
              size="sm"
              ariaLabel={t("newerRevision")}
              options={options}
              value={right?.id}
              onValueChange={setRightId}
            />
          </div>
        </div>

        {rows.length < 2 ? (
          <p className="text-sm text-muted-foreground">{t("onlyOne")}</p>
        ) : changes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("identical")}</p>
        ) : (
          <dl className="grid gap-0 overflow-hidden rounded-md border border-border">
            {changes.map((change) => (
              <div
                key={change.field}
                className="grid grid-cols-[minmax(0,180px)_minmax(0,1fr)] gap-3 border-b border-border px-3 py-2 last:border-b-0"
              >
                <dt className="truncate text-base font-medium text-subtle">{fieldLabel(change.field)}</dt>
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
