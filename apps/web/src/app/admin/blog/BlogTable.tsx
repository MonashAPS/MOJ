"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Button, Checkbox, Field, FieldGroup, Input, MultiSelect, Textarea } from "@moj/ui";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import {
  type AdminColumn,
  AdminTable,
  ConfirmAction,
  DASH,
  Flags,
  MarkdownField,
  RecordDialog,
  SearchBox,
  StatusLine,
} from "@/components/admin";
import { chosenIds } from "@/lib/choices";
import { formatDateTime } from "@/lib/format";

type PostRow = FunctionReturnType<typeof api.admin.blog.list>[number];

type AuthorOption = { id: Id<"profiles">; label: string };

type Draft = {
  id: Id<"blogPosts"> | null;
  title: string;
  slug: string;
  summary: string;
  content: string;
  visible: boolean;
  sticky: boolean;
  publishOn: string;
  authorProfileIds: Id<"profiles">[];
};

const EMPTY: Draft = {
  id: null,
  title: "",
  slug: "",
  summary: "",
  content: "",
  visible: false,
  sticky: false,
  publishOn: "",
  authorProfileIds: [],
};

/** `<input type="datetime-local">` is a native date control the kit forbids, so
 *  the publish time is a plain text field in the site's own format. */
function toLocalInput(ms: number): string {
  const date = new Date(ms);
  const pad = (value: number) => String(value).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocalInput(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(value.trim());

  if (!match) return null;
  const [, year, month, day, hour, minute] = match;

  return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)).getTime();
}

export function BlogTable({ authorOptions }: { authorOptions: AuthorOption[] | null }) {
  const t = useTranslations("admin.blog");
  const actions = useTranslations("common.actions");
  const [search, setSearch] = useState("");

  const posts = useQuery(api.admin.blog.list, search.trim() ? { search: search.trim() } : {});

  const create = useMutation(api.admin.blog.create);
  const update = useMutation(api.admin.blog.update);
  const remove = useMutation(api.admin.blog.remove);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadingPost, setLoadingPost] = useState<Id<"blogPosts"> | null>(null);
  const full = useQuery(api.admin.blog.get, loadingPost ? { id: loadingPost } : "skip");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  /** The list row does not carry the body, so editing waits one round trip. */
  useEffect(() => {
    if (!loadingPost || !full || full._id !== loadingPost) return;
    setDraft({
      id: full._id,
      title: full.title,
      slug: full.slug,
      summary: full.summary ?? "",
      content: full.content,
      visible: full.visible,
      sticky: full.sticky,
      publishOn: toLocalInput(full.publishOn),
      authorProfileIds: full.authorProfileIds,
    });
  }, [loadingPost, full]);

  async function save() {
    if (!draft) return;
    const publishOn = draft.publishOn.trim() === "" ? Date.now() : fromLocalInput(draft.publishOn);

    if (publishOn === null) {
      setError(t("publishTimeInvalid"));

      return;
    }

    setBusy(true);
    setError(null);

    try {
      const payload = {
        title: draft.title,
        slug: draft.slug,
        summary: draft.summary,
        content: draft.content,
        visible: draft.visible,
        sticky: draft.sticky,
        publishOn,
        authorProfileIds: draft.authorProfileIds,
        reason,
      };

      if (draft.id) await update({ ...payload, id: draft.id });
      else await create(payload);
      setMessage({ tone: "ok", text: t("saved", { title: draft.title }) });
      setDraft(null);
      setLoadingPost(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  const columns: AdminColumn<PostRow>[] = [
    {
      key: "title",
      header: t("columnTitle"),
      cell: (row) => (
        <span className="grid">
          <span className="font-medium text-foreground">{row.title}</span>
          <Link
            className="font-mono text-mono text-link hover:underline"
            href={`/post/${row.legacyId ?? row._id}-${row.slug}/`}
          >
            {row.slug}
          </Link>
        </span>
      ),
    },
    {
      key: "authors",
      header: t("columnAuthors"),
      cell: (row) =>
        row.authors.length === 0 ? (
          <span className="text-muted-foreground">{DASH}</span>
        ) : (
          row.authors.map((author) => author.displayName).join(", ")
        ),
    },
    {
      key: "state",
      header: t("columnState"),
      cell: (row) => (
        <Flags
          flags={[
            { on: row.visible, label: t("stateVisible"), tone: "good" },
            { on: !row.visible, label: t("stateDraft"), tone: "warn" },
            { on: row.sticky, label: t("stateSticky"), tone: "accent" },
            { on: row.publishOn > Date.now(), label: t("stateScheduled"), tone: "accent" },
          ]}
        />
      ),
    },
    {
      key: "publishOn",
      header: t("columnPublishOn"),
      numeric: true,
      cell: (row) => formatDateTime(row.publishOn),
    },
    {
      key: "actions",
      header: <span className="sr-only">{t("columnActions")}</span>,
      cell: (row) => (
        <span className="flex items-center justify-end gap-1">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setDraft(null);
              setLoadingPost(row._id);
              setReason("");
              setError(null);
            }}
          >
            {actions("edit")}
          </Button>
          <ConfirmAction
            trigger={
              <Button variant="ghost" size="sm">
                {actions("delete")}
              </Button>
            }
            title={t("deleteTitle", { title: row.title })}
            description={t("deleteDescription")}
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
        rows={posts}
        rowKey={(row) => row._id}
        toolbar={
          <>
            <SearchBox
              value={search}
              onChange={setSearch}
              placeholder={t("searchPlaceholder")}
              ariaLabel={t("searchLabel")}
            />
            <Button
              className="ml-auto"
              size="sm"
              icon={<Plus aria-hidden />}
              onClick={() => {
                setLoadingPost(null);
                setDraft({ ...EMPTY, publishOn: toLocalInput(Date.now()) });
                setReason("");
                setError(null);
              }}
            >
              {t("newPost")}
            </Button>
          </>
        }
        emptyTitle={t("emptyTitle")}
        emptyDescription={t("emptyDescription")}
        emptyAction={
          <Button
            variant="secondary"
            onClick={() => setDraft({ ...EMPTY, publishOn: toLocalInput(Date.now()) })}
          >
            {t("newPost")}
          </Button>
        }
      />

      <RecordDialog
        open={draft !== null}
        onOpenChange={(next) => {
          if (!next) {
            setDraft(null);
            setLoadingPost(null);
          }
        }}
        title={draft?.id ? t("editTitle", { title: draft.title }) : t("newTitle")}
        onSubmit={save}
        busy={busy}
        error={error}
        submitLabel={draft?.id ? t("submitSave") : t("submitCreate")}
        width={880}
      >
        <FieldGroup columns={2}>
          <Field label={t("postTitle")}>
            <Input
              value={draft?.title ?? ""}
              maxLength={100}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, title: event.target.value } : current))
              }
            />
          </Field>
          <Field label={t("slug")} optional={t("optional")} hint={t("slugHint")}>
            <Input
              mono
              value={draft?.slug ?? ""}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, slug: event.target.value } : current))
              }
            />
          </Field>
          <Field label={t("authors")} hint={authorOptions ? t("authorsHint") : t("authorsLockedHint")}>
            <MultiSelect
              options={(authorOptions ?? []).map((option) => ({ value: option.id, label: option.label }))}
              values={draft?.authorProfileIds ?? []}
              onChange={(values) =>
                setDraft((current) =>
                  current
                    ? {
                        ...current,
                        authorProfileIds: chosenIds(
                          values,
                          (authorOptions ?? []).map((option) => option.id),
                        ),
                      }
                    : current,
                )
              }
              disabled={!authorOptions}
              searchPlaceholder={t("authorsSearchPlaceholder")}
              emptyText={t("authorsEmpty")}
            />
          </Field>
          <Field label={t("publishOn")} hint={t("publishOnHint")}>
            <Input
              mono
              value={draft?.publishOn ?? ""}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, publishOn: event.target.value } : current))
              }
              placeholder="2026-09-11 18:00"
            />
          </Field>
        </FieldGroup>

        <Field label={t("summary")} optional={t("optional")} hint={t("summaryHint")}>
          <Textarea
            rows={3}
            value={draft?.summary ?? ""}
            onChange={(event) =>
              setDraft((current) => (current ? { ...current, summary: event.target.value } : current))
            }
          />
        </Field>

        <MarkdownField
          label={t("content")}
          hint={t("contentHint")}
          preset="blog"
          value={draft?.content ?? ""}
          onChange={(value) => setDraft((current) => (current ? { ...current, content: value } : current))}
        />

        <FieldGroup columns={2}>
          <Checkbox
            checked={draft?.visible ?? false}
            onCheckedChange={(value) =>
              setDraft((current) => (current ? { ...current, visible: value } : current))
            }
            label={t("visible")}
          />
          <Checkbox
            checked={draft?.sticky ?? false}
            onCheckedChange={(value) =>
              setDraft((current) => (current ? { ...current, sticky: value } : current))
            }
            label={t("sticky")}
          />
        </FieldGroup>
      </RecordDialog>
    </div>
  );
}
