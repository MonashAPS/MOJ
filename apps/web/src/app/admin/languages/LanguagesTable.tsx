"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Button, Field, FieldGroup, Input, Select, Textarea } from "@moj/ui";
import { useMutation, useQuery } from "convex/react";
import { Copy, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { type AdminColumn, AdminTable } from "@/components/admin/AdminTable";
import { ConfirmAction, DASH, SearchBox, StatusLine } from "@/components/admin/console";
import { RecordDialog } from "@/components/admin/RecordDialog";

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
  const t = useTranslations("admin.languages");
  const actions = useTranslations("common.actions");
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
    setBusy(true);
    setError(null);
    try {
      const { id, ...fields } = draft;
      if (id) {
        await update({ ...fields, id, reason });
        setMessage({ tone: "ok", text: t("updated", { name: draft.name }) });
      } else {
        await create({ ...fields, reason });
        setMessage({ tone: "ok", text: t("added", { name: draft.name }) });
      }
      setDraft(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function runCopy() {
    if (!copy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await copyLanguage({ sourceKey: copy.sourceKey, targetKey: copy.targetKey, reason });
      setMessage({
        tone: "ok",
        text: t("copiedMessage", {
          target: copy.targetKey,
          problems: result.problems,
          limits: result.limits,
        }),
      });
      setCopy(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("copyFailed"));
    } finally {
      setBusy(false);
    }
  }

  const columns: AdminColumn<LanguageRow>[] = [
    {
      key: "key",
      header: t("columnKey"),
      cell: (row) => <span className="font-mono text-mono font-medium">{row.key}</span>,
    },
    { key: "name", header: t("columnName"), cell: (row) => row.name },
    { key: "common", header: t("columnCommonName"), cell: (row) => row.commonName },
    {
      key: "short",
      header: t("columnShort"),
      cell: (row) => <span className="font-mono text-mono">{row.shortName || DASH}</span>,
    },
    {
      key: "extension",
      header: t("columnExtension"),
      cell: (row) => <span className="font-mono text-mono">.{row.extension}</span>,
    },
    {
      key: "shiki",
      header: t("columnHighlighting"),
      cell: (row) => <span className="font-mono text-mono">{row.shikiLang || DASH}</span>,
    },
    {
      key: "problems",
      header: t("columnProblems"),
      numeric: true,
      cell: (row) => row.problemCount.toLocaleString(),
    },
    {
      key: "actions",
      header: <span className="sr-only">{t("columnActions")}</span>,
      cell: (row) => (
        <span className="flex items-center justify-end gap-1">
          <Button variant="secondary" size="sm" onClick={() => open(row)}>
            {actions("edit")}
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
            {t("copyTo")}
          </Button>
          <ConfirmAction
            trigger={
              <Button
                variant="ghost"
                size="sm"
                disabled={row.problemCount > 0}
                title={
                  row.problemCount > 0
                    ? t("deleteBlocked", { count: row.problemCount, name: row.name })
                    : undefined
                }
              >
                {actions("delete")}
              </Button>
            }
            title={t("deleteTitle", { name: row.name })}
            description={t("deleteDescription")}
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
        rows={rows}
        rowKey={(row) => row._id}
        toolbar={
          <>
            <SearchBox
              value={search}
              onChange={setSearch}
              placeholder={t("searchPlaceholder")}
              ariaLabel={t("searchLabel")}
            />
            <span className="text-sm text-muted-foreground">
              {rows ? t("filterCount", { shown: rows.length, total: languages?.length ?? 0 }) : ""}
            </span>
            <Button className="ml-auto" size="sm" icon={<Plus aria-hidden />} onClick={() => open()}>
              {t("newLanguage")}
            </Button>
          </>
        }
        emptyTitle={t("emptyTitle")}
        emptyDescription={t("emptyDescription")}
        emptyAction={
          <Button variant="secondary" onClick={() => setSearch("")}>
            {t("clearSearch")}
          </Button>
        }
      />

      <RecordDialog
        open={draft !== null}
        onOpenChange={(next) => (next ? undefined : setDraft(null))}
        title={draft?.id ? t("editTitle", { name: draft.name }) : t("newTitle")}
        description={t("dialogDescription")}
        onSubmit={save}
        busy={busy}
        error={error}
        submitLabel={draft?.id ? t("saveSubmit") : t("createSubmit")}
        width={720}
      >
        <FieldGroup columns={2}>
          <Field label={t("key")} hint={t("keyHint")}>
            <Input
              mono
              maxLength={6}
              value={draft?.key ?? ""}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, key: event.target.value } : current))
              }
            />
          </Field>
          <Field label={t("name")} hint={t("nameHint")}>
            <Input
              value={draft?.name ?? ""}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, name: event.target.value } : current))
              }
            />
          </Field>
          <Field label={t("shortName")} optional={t("optional")} hint={t("shortNameHint")}>
            <Input
              mono
              value={draft?.shortName ?? ""}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, shortName: event.target.value } : current))
              }
            />
          </Field>
          <Field label={t("commonName")} hint={t("commonNameHint")}>
            <Input
              value={draft?.commonName ?? ""}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, commonName: event.target.value } : current))
              }
            />
          </Field>
          <Field label={t("editorMode")} hint={t("editorModeHint")}>
            <Input
              mono
              value={draft?.editorMode ?? ""}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, editorMode: event.target.value } : current))
              }
            />
          </Field>
          <Field label={t("shikiLang")} hint={t("shikiLangHint")}>
            <Input
              mono
              value={draft?.shikiLang ?? ""}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, shikiLang: event.target.value } : current))
              }
            />
          </Field>
          <Field label={t("extension")} hint={t("extensionHint")}>
            <Input
              mono
              value={draft?.extension ?? ""}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, extension: event.target.value } : current))
              }
            />
          </Field>
          <Field label={t("info")} optional={t("optional")} hint={t("infoHint")}>
            <Input
              value={draft?.info ?? ""}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, info: event.target.value } : current))
              }
            />
          </Field>
        </FieldGroup>
        <Field label={t("template")} optional={t("optional")} hint={t("templateHint")}>
          <Textarea
            mono
            rows={5}
            value={draft?.template ?? ""}
            onChange={(event) =>
              setDraft((current) => (current ? { ...current, template: event.target.value } : current))
            }
          />
        </Field>
        <Field label={t("description")} optional={t("optional")} hint={t("descriptionHint")}>
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
        title={t("copyTitle", { source: copy?.sourceKey ?? "" })}
        description={t("copyDescription")}
        onSubmit={runCopy}
        busy={busy}
        error={error}
        submitLabel={t("copySubmit")}
      >
        <Field label={t("targetLanguage")} hint={t("targetLanguageHint")}>
          <Select
            options={(languages ?? [])
              .filter((row) => row.key !== copy?.sourceKey)
              .map((row) => ({ value: row.key, label: `${row.key} — ${row.name}` }))}
            value={copy?.targetKey ?? ""}
            onValueChange={(value) =>
              setCopy((current) => (current ? { ...current, targetKey: value } : current))
            }
            ariaLabel={t("targetLanguage")}
            placeholder={t("pickLanguage")}
          />
        </Field>
      </RecordDialog>
    </div>
  );
}
