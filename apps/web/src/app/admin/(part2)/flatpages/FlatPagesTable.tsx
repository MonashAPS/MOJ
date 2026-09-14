"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Button, Checkbox, Field, FieldGroup, Input } from "@moj/ui";
import { useMutation, useQuery } from "convex/react";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { type AdminColumn, AdminTable } from "@/components/admin/AdminTable";
import { ConfirmAction, Flags, StatusLine } from "../_components/console";
import { MarkdownField } from "../_components/MarkdownField";
import { RecordDialog } from "../_components/RecordDialog";

type FlatPageRow = {
  _id: Id<"flatPages">;
  url: string;
  title: string;
  content: string;
  enableComments?: boolean;
};

type Draft = {
  id: Id<"flatPages"> | null;
  url: string;
  title: string;
  content: string;
  enableComments: boolean;
};

const EMPTY: Draft = { id: null, url: "/", title: "", content: "", enableComments: false };

export function FlatPagesTable() {
  const t = useTranslations("admin.flatpages");
  const actions = useTranslations("common.actions");
  const pages = useQuery(api.admin.site.flatPageRows, {}) as FlatPageRow[] | undefined;
  const create = useMutation(api.admin.site.createFlatPage);
  const update = useMutation(api.admin.site.updateFlatPage);
  const remove = useMutation(api.admin.site.deleteFlatPage);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  function open(row?: FlatPageRow) {
    setDraft(
      row
        ? {
            id: row._id,
            url: row.url,
            title: row.title,
            content: row.content,
            enableComments: row.enableComments ?? false,
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
      const { id, ...fields } = draft;
      if (id) await update({ ...fields, id, reason });
      else await create({ ...fields, reason });
      setMessage({ tone: "ok", text: t("saved", { title: draft.title }) });
      setDraft(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  const columns: AdminColumn<FlatPageRow>[] = [
    {
      key: "title",
      header: t("columnTitle"),
      cell: (row) => <span className="font-medium">{row.title}</span>,
    },
    {
      key: "url",
      header: t("columnUrl"),
      cell: (row) => (
        <Link className="font-mono text-mono text-link hover:underline" href={row.url}>
          {row.url}
        </Link>
      ),
    },
    {
      key: "comments",
      header: t("columnComments"),
      cell: (row) => (
        <Flags flags={[{ on: row.enableComments ?? false, label: t("commentsOpen"), tone: "good" }]} />
      ),
    },
    {
      key: "length",
      header: t("columnLength"),
      numeric: true,
      cell: (row) => t("length", { value: row.content.length.toLocaleString() }),
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
            title={t("deleteTitle", { title: row.title })}
            description={t("deleteDescription", { url: row.url })}
            confirmLabel={t("deleteConfirm")}
            onConfirm={async () => {
              try {
                await remove({ id: row._id, reason: "Deleted from the console" });
                setMessage({ tone: "ok", text: t("deleted", { title: row.title }) });
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
        rows={pages}
        rowKey={(row) => row._id}
        toolbar={
          <>
            <span className="text-sm text-muted-foreground">{t("toolbarNote")}</span>
            <Button className="ml-auto" size="sm" icon={<Plus aria-hidden />} onClick={() => open()}>
              {t("newPage")}
            </Button>
          </>
        }
        emptyTitle={t("emptyTitle")}
        emptyDescription={t("emptyDescription")}
        emptyAction={
          <Button variant="secondary" onClick={() => open()}>
            {t("newPage")}
          </Button>
        }
      />

      <RecordDialog
        open={draft !== null}
        onOpenChange={(next) => (next ? undefined : setDraft(null))}
        title={draft?.id ? t("editTitle", { title: draft.title }) : t("newTitle")}
        onSubmit={save}
        reason={reason}
        onReasonChange={setReason}
        busy={busy}
        error={error}
        submitLabel={draft?.id ? t("submitSave") : t("submitCreate")}
        width={880}
      >
        <FieldGroup columns={2}>
          <Field label={t("pageTitle")} hint={t("pageTitleHint")}>
            <Input
              value={draft?.title ?? ""}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, title: event.target.value } : current))
              }
            />
          </Field>
          <Field label={t("url")} hint={t("urlHint")}>
            <Input
              mono
              value={draft?.url ?? ""}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, url: event.target.value } : current))
              }
              placeholder="/rules/"
            />
          </Field>
        </FieldGroup>

        <MarkdownField
          label={t("content")}
          hint={t("contentHint")}
          preset="flatpage"
          value={draft?.content ?? ""}
          onChange={(value) => setDraft((current) => (current ? { ...current, content: value } : current))}
        />

        <Checkbox
          checked={draft?.enableComments ?? false}
          onCheckedChange={(value) =>
            setDraft((current) => (current ? { ...current, enableComments: value } : current))
          }
          label={t("enableComments")}
        />
      </RecordDialog>
    </div>
  );
}
