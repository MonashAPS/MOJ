"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Button, Field, FieldGroup, Input, Panel, Tooltip } from "@moj/ui";
import { useMutation, useQuery } from "convex/react";
import { ChevronDown, ChevronRight, ChevronUp, CornerDownRight, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { type AdminColumn, AdminTable } from "@/components/admin/AdminTable";
import { ConfirmAction, StatusLine } from "../_components/console";
import { RecordDialog } from "../_components/RecordDialog";

type NavRow = {
  _id: Id<"navigationBar">;
  key: string;
  label: string;
  path: string;
  regex: string;
  order: number;
  parentId?: Id<"navigationBar">;
};

type FlatRow = NavRow & { depth: number; index: number; siblings: NavRow[] };

type Draft = {
  id: Id<"navigationBar"> | null;
  key: string;
  label: string;
  path: string;
  regex: string;
  parentId: string;
};

const EMPTY: Draft = { id: null, key: "", label: "", path: "/", regex: "", parentId: "" };

/** DMOJ's nav is one table with a self reference; the console renders it as the
 *  tree the bar actually draws. */
function flatten(rows: NavRow[]): FlatRow[] {
  const byParent = new Map<string, NavRow[]>();
  for (const row of rows) {
    const key = row.parentId ?? "";
    const bucket = byParent.get(key);
    if (bucket) bucket.push(row);
    else byParent.set(key, [row]);
  }
  for (const bucket of byParent.values()) bucket.sort((a, b) => a.order - b.order);

  const out: FlatRow[] = [];
  const walk = (parent: string, depth: number) => {
    const siblings = byParent.get(parent) ?? [];
    siblings.forEach((row, index) => {
      out.push({ ...row, depth, index, siblings });
      walk(row._id, depth + 1);
    });
  };
  walk("", 0);
  return out;
}

export function NavigationEditor() {
  const t = useTranslations("admin.navigation");
  const actions = useTranslations("common.actions");
  const rows = useQuery(api.admin.site.navRows, {}) as NavRow[] | undefined;
  const createItem = useMutation(api.admin.site.createNavItem);
  const updateItem = useMutation(api.admin.site.updateNavItem);
  const deleteItem = useMutation(api.admin.site.deleteNavItem);
  const reorder = useMutation(api.admin.site.reorderNav);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const tree = useMemo(() => (rows ? flatten(rows) : undefined), [rows]);

  function open(row?: NavRow) {
    setDraft(
      row
        ? {
            id: row._id,
            key: row.key,
            label: row.label,
            path: row.path,
            regex: row.regex,
            parentId: row.parentId ?? "",
          }
        : { ...EMPTY },
    );
    setReason("");
    setError(null);
  }

  async function save() {
    if (!draft) return;
    if (reason.trim().length === 0) {
      setError(t("reasonRequired"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (draft.id) {
        await updateItem({
          id: draft.id,
          key: draft.key,
          label: draft.label,
          path: draft.path,
          regex: draft.regex,
          parentId: draft.parentId ? (draft.parentId as Id<"navigationBar">) : null,
          reason,
        });
      } else {
        await createItem({
          key: draft.key,
          label: draft.label,
          path: draft.path,
          regex: draft.regex,
          order: (rows?.length ?? 0) + 1,
          ...(draft.parentId ? { parentId: draft.parentId as Id<"navigationBar"> } : {}),
          reason,
        });
      }
      setMessage({ tone: "ok", text: t("saved", { label: draft.label }) });
      setDraft(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function run(action: () => Promise<unknown>, ok: string) {
    try {
      await action();
      setMessage({ tone: "ok", text: ok });
    } catch (caught) {
      setMessage({ tone: "bad", text: caught instanceof Error ? caught.message : t("actionFailed") });
    }
  }

  /** Swapping two siblings' orders is the whole of "move up" and "move down". */
  function move(row: FlatRow, direction: -1 | 1) {
    const target = row.siblings[row.index + direction];
    if (!target) return;
    void run(
      () =>
        reorder({
          items: [
            { id: row._id, order: target.order },
            { id: target._id, order: row.order },
          ],
        }),
      direction === -1 ? t("movedUp", { label: row.label }) : t("movedDown", { label: row.label }),
    );
  }

  /** Indent makes the item a child of the sibling above it; outdent hands it to
   *  its grandparent, which is DMOJ's two-level bar. */
  function indent(row: FlatRow) {
    const previous = row.siblings[row.index - 1];
    if (!previous) return;
    void run(
      () => reorder({ items: [{ id: row._id, order: row.order, parentId: previous._id }] }),
      t("nested", { label: row.label, parent: previous.label }),
    );
  }

  function outdent(row: FlatRow, all: FlatRow[]) {
    if (!row.parentId) return;
    const parent = all.find((entry) => entry._id === row.parentId);
    void run(
      () => reorder({ items: [{ id: row._id, order: row.order, parentId: parent?.parentId ?? null }] }),
      parent
        ? t("outdented", { label: row.label, parent: parent.label })
        : t("outdentedFromParent", { label: row.label }),
    );
  }

  const columns: AdminColumn<FlatRow>[] = [
    {
      key: "label",
      header: t("columnItem"),
      cell: (row) => (
        <span className="flex items-center gap-1" style={{ paddingLeft: row.depth * 18 }}>
          {row.depth > 0 ? <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden /> : null}
          <span className="font-medium text-foreground">{row.label}</span>
        </span>
      ),
    },
    {
      key: "key",
      header: t("columnKey"),
      cell: (row) => <span className="font-mono text-mono">{row.key}</span>,
    },
    {
      key: "path",
      header: t("columnPath"),
      cell: (row) => <span className="font-mono text-mono">{row.path}</span>,
    },
    {
      key: "regex",
      header: t("columnRegex"),
      cell: (row) => <span className="font-mono text-mono text-subtle">{row.regex}</span>,
    },
    { key: "order", header: t("columnOrder"), numeric: true, cell: (row) => row.order },
    {
      key: "actions",
      header: <span className="sr-only">{t("columnActions")}</span>,
      cell: (row) => (
        <span className="flex items-center justify-end gap-1">
          <Tooltip content={t("moveUp")}>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("moveUpLabel", { label: row.label })}
              disabled={row.index === 0}
              title={row.index === 0 ? t("moveUpDisabled") : undefined}
              onClick={() => move(row, -1)}
            >
              <ChevronUp aria-hidden />
            </Button>
          </Tooltip>
          <Tooltip content={t("moveDown")}>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("moveDownLabel", { label: row.label })}
              disabled={row.index === row.siblings.length - 1}
              title={row.index === row.siblings.length - 1 ? t("moveDownDisabled") : undefined}
              onClick={() => move(row, 1)}
            >
              <ChevronDown aria-hidden />
            </Button>
          </Tooltip>
          <Tooltip content={t("indent")}>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("indentLabel", { label: row.label })}
              disabled={row.index === 0}
              title={row.index === 0 ? t("indentDisabled") : undefined}
              onClick={() => indent(row)}
            >
              <CornerDownRight aria-hidden />
            </Button>
          </Tooltip>
          <Button
            variant="ghost"
            size="sm"
            disabled={!row.parentId}
            title={row.parentId ? undefined : t("outdentDisabled")}
            onClick={() => outdent(row, tree ?? [])}
          >
            {t("outdent")}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => open(row)}>
            {actions("edit")}
          </Button>
          <ConfirmAction
            trigger={
              <Button variant="ghost" size="sm">
                {actions("delete")}
              </Button>
            }
            title={t("deleteTitle", { label: row.label })}
            description={t("deleteDescription")}
            confirmLabel={t("deleteConfirm")}
            onConfirm={() =>
              run(
                () => deleteItem({ id: row._id, reason: "Deleted from the console" }),
                t("deleted", { label: row.label }),
              )
            }
          />
        </span>
      ),
    },
  ];

  return (
    <div className="grid gap-3">
      {message ? <StatusLine tone={message.tone}>{message.text}</StatusLine> : null}

      <AdminTable
        columns={columns}
        rows={tree}
        rowKey={(row) => row._id}
        toolbar={
          <>
            <span className="text-sm text-muted-foreground">{t("toolbarNote")}</span>
            <Button className="ml-auto" size="sm" icon={<Plus aria-hidden />} onClick={() => open()}>
              {t("newItem")}
            </Button>
          </>
        }
        emptyTitle={t("emptyTitle")}
        emptyDescription={t("emptyDescription")}
        emptyAction={
          <Button variant="secondary" onClick={() => open()}>
            {t("newItem")}
          </Button>
        }
      />

      <Panel title={t("highlightTitle")} bodyClassName="p-3">
        <p className="text-sm text-muted-foreground">
          {t.rich("highlightBody", {
            code: (chunks) => <code className="font-mono">{chunks}</code>,
          })}
        </p>
      </Panel>

      <RecordDialog
        open={draft !== null}
        onOpenChange={(next) => (next ? undefined : setDraft(null))}
        title={draft?.id ? t("editTitle", { label: draft.label }) : t("newTitle")}
        onSubmit={save}
        reason={reason}
        onReasonChange={setReason}
        busy={busy}
        error={error}
        submitLabel={draft?.id ? t("submitSave") : t("submitCreate")}
      >
        <FieldGroup columns={2}>
          <Field label={t("label")} hint={t("labelHint")}>
            <Input
              value={draft?.label ?? ""}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, label: event.target.value } : current))
              }
            />
          </Field>
          <Field label={t("key")} hint={t("keyHint")}>
            <Input
              mono
              maxLength={10}
              value={draft?.key ?? ""}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, key: event.target.value } : current))
              }
            />
          </Field>
        </FieldGroup>
        <Field label={t("path")} hint={t("pathHint")}>
          <Input
            mono
            value={draft?.path ?? ""}
            onChange={(event) =>
              setDraft((current) => (current ? { ...current, path: event.target.value } : current))
            }
          />
        </Field>
        <Field label={t("regex")} hint={t("regexHint")}>
          <Input
            mono
            value={draft?.regex ?? ""}
            onChange={(event) =>
              setDraft((current) => (current ? { ...current, regex: event.target.value } : current))
            }
            placeholder="^/problem"
          />
        </Field>
      </RecordDialog>
    </div>
  );
}
