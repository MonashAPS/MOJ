"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Button, Field, FieldGroup, Input, Textarea } from "@moj/ui";
import { useMutation, useQuery } from "convex/react";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { type AdminColumn, AdminTable } from "@/components/admin/AdminTable";
import { ConfirmAction, DASH, StatusLine } from "@/components/admin/console";
import { RecordDialog } from "@/components/admin/RecordDialog";

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
  const t = useTranslations("admin.licenses");
  const actions = useTranslations("common.actions");
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

  const columns: AdminColumn<LicenseRow>[] = [
    {
      key: "key",
      header: t("columnKey"),
      cell: (row) => <span className="font-mono text-mono font-medium">{row.key}</span>,
    },
    { key: "name", header: t("columnName"), cell: (row) => row.name },
    { key: "display", header: t("columnDisplay"), cell: (row) => row.display || DASH },
    {
      key: "link",
      header: t("columnLink"),
      cell: (row) => (
        <a className="text-link hover:underline" href={row.link} rel="nofollow noreferrer" target="_blank">
          {row.link}
        </a>
      ),
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
          <ConfirmAction
            trigger={
              <Button variant="ghost" size="sm">
                {actions("delete")}
              </Button>
            }
            title={t("deleteTitle", { name: row.name })}
            description={
              row.problemCount > 0
                ? t("deleteDescription", { count: row.problemCount })
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
        rows={licenses}
        rowKey={(row) => row._id}
        toolbar={
          <Button className="ml-auto" size="sm" icon={<Plus aria-hidden />} onClick={() => open()}>
            {t("newLicense")}
          </Button>
        }
        emptyTitle={t("emptyTitle")}
        emptyDescription={t("emptyDescription")}
        emptyAction={
          <Button variant="secondary" onClick={() => open()}>
            {t("newLicense")}
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
          <Field label={t("key")} hint={t("keyHint")}>
            <Input
              mono
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
          <Field label={t("display")} optional={t("optional")} hint={t("displayHint")}>
            <Input
              value={draft?.display ?? ""}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, display: event.target.value } : current))
              }
            />
          </Field>
          <Field label={t("icon")} optional={t("optional")} hint={t("iconHint")}>
            <Input
              mono
              value={draft?.icon ?? ""}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, icon: event.target.value } : current))
              }
            />
          </Field>
        </FieldGroup>
        <Field label={t("link")} hint={t("linkHint")}>
          <Input
            mono
            value={draft?.link ?? ""}
            onChange={(event) =>
              setDraft((current) => (current ? { ...current, link: event.target.value } : current))
            }
          />
        </Field>
        <Field label={t("text")} optional={t("optional")} hint={t("textHint")}>
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
