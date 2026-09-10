"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Button, Checkbox, Field, FieldGroup, Input } from "@moj/ui";
import { useMutation, useQuery } from "convex/react";
import { Plus } from "lucide-react";
import Link from "next/link";
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
      setError("Give a reason for the change; it is recorded on the revision.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { id, ...fields } = draft;
      if (id) await update({ ...fields, id, reason });
      else await create({ ...fields, reason });
      setMessage({ tone: "ok", text: `${draft.title} has been saved.` });
      setDraft(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That page could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  const columns: AdminColumn<FlatPageRow>[] = [
    { key: "title", header: "Title", cell: (row) => <span className="font-medium">{row.title}</span> },
    {
      key: "url",
      header: "URL",
      cell: (row) => (
        <Link className="font-mono text-mono text-link hover:underline" href={row.url}>
          {row.url}
        </Link>
      ),
    },
    {
      key: "comments",
      header: "Comments",
      cell: (row) => <Flags flags={[{ on: row.enableComments ?? false, label: "Open", tone: "good" }]} />,
    },
    {
      key: "length",
      header: "Length",
      numeric: true,
      cell: (row) => `${row.content.length.toLocaleString()} ch`,
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      cell: (row) => (
        <span className="flex items-center justify-end gap-1">
          <Button variant="secondary" size="sm" onClick={() => open(row)}>
            Edit
          </Button>
          <ConfirmAction
            trigger={
              <Button variant="ghost" size="sm">
                Delete
              </Button>
            }
            title={`Delete ${row.title}?`}
            description={`${row.url} stops resolving and anyone linking to it lands on the 404 page.`}
            confirmLabel="Delete page"
            onConfirm={async () => {
              try {
                await remove({ id: row._id, reason: "Deleted from the console" });
                setMessage({ tone: "ok", text: `${row.title} has been deleted.` });
              } catch (caught) {
                setMessage({
                  tone: "bad",
                  text: caught instanceof Error ? caught.message : "That page could not be deleted.",
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
            <span className="text-sm text-muted-foreground">
              Static pages served by URL, the way DMOJ serves /about/.
            </span>
            <Button className="ml-auto" size="sm" icon={<Plus aria-hidden />} onClick={() => open()}>
              New page
            </Button>
          </>
        }
        emptyTitle="No flat pages"
        emptyDescription="A flat page is somewhere to put the club's rules or a contest's information."
        emptyAction={
          <Button variant="secondary" onClick={() => open()}>
            New page
          </Button>
        }
      />

      <RecordDialog
        open={draft !== null}
        onOpenChange={(next) => (next ? undefined : setDraft(null))}
        title={draft?.id ? `Edit ${draft.title}` : "New flat page"}
        onSubmit={save}
        reason={reason}
        onReasonChange={setReason}
        busy={busy}
        error={error}
        submitLabel={draft?.id ? "Save page" : "Create page"}
        width={880}
      >
        <FieldGroup columns={2}>
          <Field label="Title" hint="The heading and the browser tab.">
            <Input
              value={draft?.title ?? ""}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, title: event.target.value } : current))
              }
            />
          </Field>
          <Field label="URL" hint="Starts and ends with a slash.">
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
          label="Content"
          hint="Markdown, rendered with the flat page preset."
          preset="flatpage"
          value={draft?.content ?? ""}
          onChange={(value) => setDraft((current) => (current ? { ...current, content: value } : current))}
        />

        <Checkbox
          checked={draft?.enableComments ?? false}
          onCheckedChange={(value) =>
            setDraft((current) => (current ? { ...current, enableComments: value } : current))
          }
          label="Members can comment on this page"
        />
      </RecordDialog>
    </div>
  );
}
