"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Badge, Button, Field, FieldGroup, Input, Textarea } from "@moj/ui";
import { useMutation, useQuery } from "convex/react";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { type AdminColumn, AdminTable } from "@/components/admin/AdminTable";
import { ConfirmAction, DASH, StatusLine } from "@/components/admin/console";
import { RecordDialog } from "@/components/admin/RecordDialog";

type TagRow = {
  _id: Id<"contestTags">;
  name: string;
  color: string;
  description: string;
  contestCount: number;
};

type Draft = { id: Id<"contestTags"> | null; name: string; color: string; description: string };

const EMPTY: Draft = { id: null, name: "", color: "#2941a5", description: "" };

export function TagsTable() {
  const t = useTranslations("admin.tags");
  const actions = useTranslations("common.actions");
  const tags = useQuery(api.admin.tags.list, {}) as TagRow[] | undefined;
  const create = useMutation(api.admin.tags.create);
  const update = useMutation(api.admin.tags.update);
  const remove = useMutation(api.admin.tags.remove);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  function open(row?: TagRow) {
    setDraft(row ? { id: row._id, name: row.name, color: row.color, description: row.description } : EMPTY);
    setReason("");
    setError(null);
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError(null);

    try {
      const { id, ...fields } = draft;

      if (id) await update({ ...fields, id, reason });
      else await create({ ...fields, reason });
      setMessage({ tone: "ok", text: t("savedMessage", { name: draft.name }) });
      setDraft(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  const columns: AdminColumn<TagRow>[] = [
    {
      key: "name",
      header: t("columnTag"),
      cell: (row) => (
        <span className="flex items-center gap-2">
          <span
            aria-hidden
            className="size-3 rounded-xs border border-border"
            style={{ backgroundColor: row.color }}
          />
          <Badge variant="outline" mono>
            {row.name}
          </Badge>
        </span>
      ),
    },
    {
      key: "color",
      header: t("columnColour"),
      cell: (row) => <span className="font-mono text-mono">{row.color}</span>,
    },
    { key: "description", header: t("columnDescription"), cell: (row) => row.description || DASH },
    {
      key: "contests",
      header: t("columnContests"),
      numeric: true,
      cell: (row) => row.contestCount.toLocaleString(),
    },
    {
      key: "actions",
      header: <span className="sr-only">{t("columnActions")}</span>,
      cell: (row) => (
        <span className="flex items-center justify-end gap-1">
          <Button variant="secondary" size="sm" onClick={() => open(row)}>
            {actions("edit")}
          </Button>
          <ConfirmAction
            trigger={
              <Button variant="ghost" size="sm">
                {actions("delete")}
              </Button>
            }
            title={t("deleteTitle", { name: row.name })}
            description={
              row.contestCount > 0
                ? t("deleteDescription", { count: row.contestCount })
                : t("deleteDescriptionNone")
            }
            confirmLabel={t("deleteConfirm")}
            onConfirm={async () => {
              try {
                await remove({ id: row._id, reason: "Deleted from the console" });
                setMessage({ tone: "ok", text: t("deletedMessage", { name: row.name }) });
              } catch (caught) {
                setMessage({
                  tone: "bad",
                  text: caught instanceof Error ? caught.message : t("deleteFailed"),
                });
              }
            }}
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
        rows={tags}
        rowKey={(row) => row._id}
        toolbar={
          <Button className="ml-auto" size="sm" icon={<Plus aria-hidden />} onClick={() => open()}>
            {t("newTag")}
          </Button>
        }
        emptyTitle={t("emptyTitle")}
        emptyDescription={t("emptyDescription")}
        emptyAction={
          <Button variant="secondary" onClick={() => open()}>
            {t("newTag")}
          </Button>
        }
      />

      <RecordDialog
        open={draft !== null}
        onOpenChange={(next) => (next ? undefined : setDraft(null))}
        title={draft?.id ? t("editTitle", { name: draft.name }) : t("newTitle")}
        onSubmit={save}
        busy={busy}
        error={error}
        submitLabel={draft?.id ? t("saveSubmit") : t("createSubmit")}
      >
        <FieldGroup columns={2}>
          <Field label={t("name")} hint={t("nameHint")}>
            <Input
              mono
              value={draft?.name ?? ""}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, name: event.target.value } : current))
              }
            />
          </Field>
          <Field label={t("colour")} hint={t("colourHint")}>
            <Input
              mono
              value={draft?.color ?? ""}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, color: event.target.value } : current))
              }
            />
          </Field>
        </FieldGroup>
        <Field label={t("description")} optional={t("optional")} hint={t("descriptionHint")}>
          <Textarea
            rows={3}
            value={draft?.description ?? ""}
            onChange={(event) =>
              setDraft((current) => (current ? { ...current, description: event.target.value } : current))
            }
          />
        </Field>
      </RecordDialog>
    </div>
  );
}
