"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Button, Field, FieldGroup, Input, Select, Textarea } from "@moj/ui";
import { useMutation, useQuery } from "convex/react";
import { Copy, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { type AdminColumn, AdminTable } from "@/components/admin/AdminTable";
import { ConfirmAction, DASH, SearchBox, StatusLine } from "../_components/console";
import { RecordDialog } from "../_components/RecordDialog";

type LanguageRow = {
  _id: Id<"languages">;
  key: string;
  name: string;
  shortName: string;
  commonName: string;
  editorMode: string;
  shikiLang: string;
  extension: string;
  template: string;
  info: string;
  description: string;
  problemCount: number;
};

type Draft = {
  id: Id<"languages"> | null;
  key: string;
  name: string;
  shortName: string;
  commonName: string;
  editorMode: string;
  shikiLang: string;
  extension: string;
  template: string;
  info: string;
  description: string;
};

const EMPTY: Draft = {
  id: null,
  key: "",
  name: "",
  shortName: "",
  commonName: "",
  editorMode: "",
  shikiLang: "",
  extension: "",
  template: "",
  info: "",
  description: "",
};

export function LanguagesTable() {
  const languages = useQuery(api.admin.languages.list, {}) as LanguageRow[] | undefined;
  const create = useMutation(api.admin.languages.create);
  const update = useMutation(api.admin.languages.update);
  const remove = useMutation(api.admin.languages.remove);
  const copyLanguage = useMutation(api.admin.languages.copyLanguage);

  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [copy, setCopy] = useState<{ sourceKey: string; targetKey: string } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const rows = useMemo(() => {
    if (!languages) return undefined;
    const needle = search.trim().toLowerCase();
    if (!needle) return languages;
    return languages.filter(
      (row) =>
        row.key.toLowerCase().includes(needle) ||
        row.name.toLowerCase().includes(needle) ||
        row.commonName.toLowerCase().includes(needle),
    );
  }, [languages, search]);

  function open(row?: LanguageRow) {
    setDraft(
      row
        ? {
            id: row._id,
            key: row.key,
            name: row.name,
            shortName: row.shortName,
            commonName: row.commonName,
            editorMode: row.editorMode,
            shikiLang: row.shikiLang,
            extension: row.extension,
            template: row.template,
            info: row.info,
            description: row.description,
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
      if (id) {
        await update({ ...fields, id, reason });
        setMessage({ tone: "ok", text: `${draft.name} has been updated.` });
      } else {
        await create({ ...fields, reason });
        setMessage({ tone: "ok", text: `${draft.name} has been added.` });
      }
      setDraft(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That language could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function runCopy() {
    if (!copy) return;
    if (reason.trim().length === 0) {
      setError("Give a reason for the change; it is recorded on the revision.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await copyLanguage({ sourceKey: copy.sourceKey, targetKey: copy.targetKey, reason });
      setMessage({
        tone: "ok",
        text: `${copy.targetKey} now runs on ${result.problems} more ${result.problems === 1 ? "problem" : "problems"}, with ${result.limits} copied ${result.limits === 1 ? "limit" : "limits"}.`,
      });
      setCopy(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That copy did not work.");
    } finally {
      setBusy(false);
    }
  }

  const columns: AdminColumn<LanguageRow>[] = [
    {
      key: "key",
      header: "Key",
      cell: (row) => <span className="font-mono text-mono font-medium">{row.key}</span>,
    },
    { key: "name", header: "Name", cell: (row) => row.name },
    { key: "common", header: "Common name", cell: (row) => row.commonName },
    {
      key: "short",
      header: "Short",
      cell: (row) => <span className="font-mono text-mono">{row.shortName || DASH}</span>,
    },
    {
      key: "extension",
      header: "Extension",
      cell: (row) => <span className="font-mono text-mono">.{row.extension}</span>,
    },
    {
      key: "shiki",
      header: "Highlighting",
      cell: (row) => <span className="font-mono text-mono">{row.shikiLang || DASH}</span>,
    },
    {
      key: "problems",
      header: "Problems",
      numeric: true,
      cell: (row) => row.problemCount.toLocaleString(),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      cell: (row) => (
        <span className="flex items-center justify-end gap-1">
          <Button variant="secondary" size="sm" onClick={() => open(row)}>
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<Copy aria-hidden />}
            onClick={() => {
              setCopy({ sourceKey: row.key, targetKey: "" });
              setReason("");
              setError(null);
            }}
          >
            Copy to…
          </Button>
          <ConfirmAction
            trigger={
              <Button
                variant="ghost"
                size="sm"
                disabled={row.problemCount > 0}
                title={
                  row.problemCount > 0 ? `${row.problemCount} problems still allow ${row.name}.` : undefined
                }
              >
                Delete
              </Button>
            }
            title={`Delete ${row.name}?`}
            description="The language is removed from every problem that allows it, along with its per-problem limits and recorded runtimes."
            confirmLabel="Delete language"
            onConfirm={async () => {
              try {
                await remove({ id: row._id, reason: "Deleted from the console" });
                setMessage({ tone: "ok", text: `${row.name} has been deleted.` });
              } catch (caught) {
                setMessage({
                  tone: "bad",
                  text: caught instanceof Error ? caught.message : "That language could not be deleted.",
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
        rows={rows}
        rowKey={(row) => row._id}
        toolbar={
          <>
            <SearchBox
              value={search}
              onChange={setSearch}
              placeholder="Key, name or common name"
              ariaLabel="Search languages"
            />
            <span className="text-sm text-muted-foreground">
              {rows ? `${rows.length} of ${languages?.length ?? 0}` : ""}
            </span>
            <Button className="ml-auto" size="sm" icon={<Plus aria-hidden />} onClick={() => open()}>
              New language
            </Button>
          </>
        }
        emptyTitle="No languages match"
        emptyDescription="Nothing here is named like that. Clear the search to see them all."
        emptyAction={
          <Button variant="secondary" onClick={() => setSearch("")}>
            Clear search
          </Button>
        }
      />

      <RecordDialog
        open={draft !== null}
        onOpenChange={(next) => (next ? undefined : setDraft(null))}
        title={draft?.id ? `Edit ${draft.name}` : "New language"}
        description="The key is what the judge announces a runtime as; everything else is what members see."
        onSubmit={save}
        reason={reason}
        onReasonChange={setReason}
        busy={busy}
        error={error}
        submitLabel={draft?.id ? "Save language" : "Create language"}
        width={720}
      >
        <FieldGroup columns={2}>
          <Field label="Key" hint="At most 6 characters, e.g. CPP20.">
            <Input
              mono
              maxLength={6}
              value={draft?.key ?? ""}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, key: event.target.value } : current))
              }
            />
          </Field>
          <Field label="Name" hint="Shown on the submit page.">
            <Input
              value={draft?.name ?? ""}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, name: event.target.value } : current))
              }
            />
          </Field>
          <Field label="Short name" optional=" (optional)" hint="Shown in a submission row.">
            <Input
              mono
              value={draft?.shortName ?? ""}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, shortName: event.target.value } : current))
              }
            />
          </Field>
          <Field label="Common name" hint="Groups the versions, e.g. every C++ under &ldquo;C++&rdquo;.">
            <Input
              value={draft?.commonName ?? ""}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, commonName: event.target.value } : current))
              }
            />
          </Field>
          <Field label="Editor mode" hint="CodeMirror's mode for the submit editor.">
            <Input
              mono
              value={draft?.editorMode ?? ""}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, editorMode: event.target.value } : current))
              }
            />
          </Field>
          <Field label="Shiki language" hint="How source is highlighted on a submission page.">
            <Input
              mono
              value={draft?.shikiLang ?? ""}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, shikiLang: event.target.value } : current))
              }
            />
          </Field>
          <Field label="Extension" hint="No leading dot.">
            <Input
              mono
              value={draft?.extension ?? ""}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, extension: event.target.value } : current))
              }
            />
          </Field>
          <Field label="Runtime info" optional=" (optional)" hint="The version string on /runtimes/.">
            <Input
              value={draft?.info ?? ""}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, info: event.target.value } : current))
              }
            />
          </Field>
        </FieldGroup>
        <Field
          label="Template"
          optional=" (optional)"
          hint="Pre-filled into the editor for a new submission."
        >
          <Textarea
            mono
            rows={5}
            value={draft?.template ?? ""}
            onChange={(event) =>
              setDraft((current) => (current ? { ...current, template: event.target.value } : current))
            }
          />
        </Field>
        <Field label="Description" optional=" (optional)" hint="Markdown, shown on the language's page.">
          <Textarea
            mono
            rows={3}
            value={draft?.description ?? ""}
            onChange={(event) =>
              setDraft((current) => (current ? { ...current, description: event.target.value } : current))
            }
          />
        </Field>
      </RecordDialog>

      <RecordDialog
        open={copy !== null}
        onOpenChange={(next) => (next ? undefined : setCopy(null))}
        title={`Copy ${copy?.sourceKey ?? ""} to another language`}
        description="Every problem that allows the source will allow the target, and the source's per-problem limits are copied across. The target's current problem set is replaced."
        onSubmit={runCopy}
        reason={reason}
        onReasonChange={setReason}
        busy={busy}
        error={error}
        submitLabel="Copy language"
      >
        <Field label="Target language" hint="The language that inherits the source's problems.">
          <Select
            options={(languages ?? [])
              .filter((row) => row.key !== copy?.sourceKey)
              .map((row) => ({ value: row.key, label: `${row.key} — ${row.name}` }))}
            value={copy?.targetKey ?? ""}
            onValueChange={(value) =>
              setCopy((current) => (current ? { ...current, targetKey: value } : current))
            }
            ariaLabel="Target language"
            placeholder="Pick a language"
          />
        </Field>
      </RecordDialog>
    </div>
  );
}
