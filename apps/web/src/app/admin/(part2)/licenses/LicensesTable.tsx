"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Button, Field, FieldGroup, Input, Textarea } from "@moj/ui";
import { useMutation, useQuery } from "convex/react";
import { Plus } from "lucide-react";
import { useState } from "react";
import { type AdminColumn, AdminTable } from "@/components/admin/AdminTable";
import { ConfirmAction, DASH, StatusLine } from "../_components/console";
import { RecordDialog } from "../_components/RecordDialog";

type LicenseRow = {
  _id: Id<"licenses">;
  key: string;
  link: string;
  name: string;
  display: string;
  icon: string;
  text: string;
  problemCount: number;
};

type Draft = {
  id: Id<"licenses"> | null;
  key: string;
  link: string;
  name: string;
  display: string;
  icon: string;
  text: string;
};

const EMPTY: Draft = { id: null, key: "", link: "", name: "", display: "", icon: "", text: "" };

export function LicensesTable() {
  const licenses = useQuery(api.admin.licenses.list, {}) as LicenseRow[] | undefined;
  const create = useMutation(api.admin.licenses.create);
  const update = useMutation(api.admin.licenses.update);
  const remove = useMutation(api.admin.licenses.remove);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  function open(row?: LicenseRow) {
    setDraft(
      row
        ? {
            id: row._id,
            key: row.key,
            link: row.link,
            name: row.name,
            display: row.display,
            icon: row.icon,
            text: row.text,
          }
        : EMPTY,
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
      setMessage({ tone: "ok", text: `${draft.name} has been saved.` });
      setDraft(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That license could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  const columns: AdminColumn<LicenseRow>[] = [
    {
      key: "key",
      header: "Key",
      cell: (row) => <span className="font-mono text-mono font-medium">{row.key}</span>,
    },
    { key: "name", header: "Name", cell: (row) => row.name },
    { key: "display", header: "Short display", cell: (row) => row.display || DASH },
    {
      key: "link",
      header: "Link",
      cell: (row) => (
        <a className="text-link hover:underline" href={row.link} rel="nofollow noreferrer" target="_blank">
          {row.link}
        </a>
      ),
    },
    { key: "problems", header: "Problems", numeric: true, cell: (row) => row.problemCount.toLocaleString() },
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
            title={`Delete ${row.name}?`}
            description={
              row.problemCount > 0
                ? `${row.problemCount} ${row.problemCount === 1 ? "problem loses" : "problems lose"} their license.`
                : "Nothing uses this license."
            }
            confirmLabel="Delete license"
            onConfirm={async () => {
              try {
                await remove({ id: row._id, reason: "Deleted from the console" });
                setMessage({ tone: "ok", text: `${row.name} has been deleted.` });
              } catch (caught) {
                setMessage({
                  tone: "bad",
                  text: caught instanceof Error ? caught.message : "That license could not be deleted.",
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
        rows={licenses}
        rowKey={(row) => row._id}
        toolbar={
          <Button className="ml-auto" size="sm" icon={<Plus aria-hidden />} onClick={() => open()}>
            New license
          </Button>
        }
        emptyTitle="No licenses"
        emptyDescription="A license is what a problem page credits when its statement is not the club's own."
        emptyAction={
          <Button variant="secondary" onClick={() => open()}>
            New license
          </Button>
        }
      />

      <RecordDialog
        open={draft !== null}
        onOpenChange={(next) => (next ? undefined : setDraft(null))}
        title={draft?.id ? `Edit ${draft.name}` : "New license"}
        onSubmit={save}
        reason={reason}
        onReasonChange={setReason}
        busy={busy}
        error={error}
        submitLabel={draft?.id ? "Save license" : "Create license"}
      >
        <FieldGroup columns={2}>
          <Field label="Key" hint="Used in the URL: /license/&lt;key&gt;.">
            <Input
              mono
              value={draft?.key ?? ""}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, key: event.target.value } : current))
              }
            />
          </Field>
          <Field label="Name" hint="The full name of the license.">
            <Input
              value={draft?.name ?? ""}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, name: event.target.value } : current))
              }
            />
          </Field>
          <Field label="Short display" optional=" (optional)" hint="What the problem page shows.">
            <Input
              value={draft?.display ?? ""}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, display: event.target.value } : current))
              }
            />
          </Field>
          <Field label="Icon" optional=" (optional)" hint="A URL to the license badge.">
            <Input
              mono
              value={draft?.icon ?? ""}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, icon: event.target.value } : current))
              }
            />
          </Field>
        </FieldGroup>
        <Field label="Link" hint="Where the license itself is published.">
          <Input
            mono
            value={draft?.link ?? ""}
            onChange={(event) =>
              setDraft((current) => (current ? { ...current, link: event.target.value } : current))
            }
          />
        </Field>
        <Field label="Text" optional=" (optional)" hint="Markdown, shown on the license page.">
          <Textarea
            mono
            rows={6}
            value={draft?.text ?? ""}
            onChange={(event) =>
              setDraft((current) => (current ? { ...current, text: event.target.value } : current))
            }
          />
        </Field>
      </RecordDialog>
    </div>
  );
}
