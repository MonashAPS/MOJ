"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Badge, Button, Field, FieldGroup, Input, Textarea } from "@moj/ui";
import { useMutation, useQuery } from "convex/react";
import { Plus } from "lucide-react";
import { useState } from "react";
import { type AdminColumn, AdminTable } from "@/components/admin/AdminTable";
import { ConfirmAction, DASH, StatusLine } from "../_components/console";
import { RecordDialog } from "../_components/RecordDialog";

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
      setMessage({ tone: "ok", text: `${draft.name} has been saved.` });
      setDraft(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That tag could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  const columns: AdminColumn<TagRow>[] = [
    {
      key: "name",
      header: "Tag",
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
      header: "Colour",
      cell: (row) => <span className="font-mono text-mono">{row.color}</span>,
    },
    { key: "description", header: "Description", cell: (row) => row.description || DASH },
    { key: "contests", header: "Contests", numeric: true, cell: (row) => row.contestCount.toLocaleString() },
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
            title={`Delete the ${row.name} tag?`}
            description={
              row.contestCount > 0
                ? `${row.contestCount} ${row.contestCount === 1 ? "contest loses" : "contests lose"} this tag.`
                : "No contest carries this tag."
            }
            confirmLabel="Delete tag"
            onConfirm={async () => {
              try {
                await remove({ id: row._id, reason: "Deleted from the console" });
                setMessage({ tone: "ok", text: `The ${row.name} tag has been deleted.` });
              } catch (caught) {
                setMessage({
                  tone: "bad",
                  text: caught instanceof Error ? caught.message : "That tag could not be deleted.",
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
            New tag
          </Button>
        }
        emptyTitle="No contest tags"
        emptyDescription="Tags group contests on the contest list — div1, div2, beginner."
        emptyAction={
          <Button variant="secondary" onClick={() => open()}>
            New tag
          </Button>
        }
      />

      <RecordDialog
        open={draft !== null}
        onOpenChange={(next) => (next ? undefined : setDraft(null))}
        title={draft?.id ? `Edit the ${draft.name} tag` : "New contest tag"}
        onSubmit={save}
        reason={reason}
        onReasonChange={setReason}
        busy={busy}
        error={error}
        submitLabel={draft?.id ? "Save tag" : "Create tag"}
      >
        <FieldGroup columns={2}>
          <Field label="Name" hint="Lowercase letters and dashes only.">
            <Input
              mono
              value={draft?.name ?? ""}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, name: event.target.value } : current))
              }
            />
          </Field>
          <Field label="Colour" hint="A hex value like #2941a5.">
            <Input
              mono
              value={draft?.color ?? ""}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, color: event.target.value } : current))
              }
            />
          </Field>
        </FieldGroup>
        <Field
          label="Description"
          optional=" (optional)"
          hint="Shown in the tag's tooltip on the contest list."
        >
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
