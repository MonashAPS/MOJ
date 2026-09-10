"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Button, Checkbox, Field, FieldGroup, Input, MultiSelect, Textarea } from "@moj/ui";
import { useMutation, useQuery } from "convex/react";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { type AdminColumn, AdminTable } from "@/components/admin/AdminTable";
import { formatDateTime } from "@/lib/format";
import { ConfirmAction, DASH, Flags, SearchBox, StatusLine } from "../_components/console";
import { MarkdownField } from "../_components/MarkdownField";
import { RecordDialog } from "../_components/RecordDialog";

type PostRow = {
  _id: Id<"blogPosts">;
  legacyId?: number;
  title: string;
  slug: string;
  visible: boolean;
  sticky: boolean;
  publishOn: number;
  authors: Array<{ _id: string; username: string; displayName: string }>;
};

type Draft = {
  id: Id<"blogPosts"> | null;
  title: string;
  slug: string;
  summary: string;
  content: string;
  visible: boolean;
  sticky: boolean;
  publishOn: string;
  authorProfileIds: string[];
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

export function BlogTable({ authorOptions }: { authorOptions: Array<{ id: string; label: string }> | null }) {
  const [search, setSearch] = useState("");
  const posts = useQuery(api.admin.blog.list, search.trim() ? { search: search.trim() } : {}) as
    | PostRow[]
    | undefined;
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
      authorProfileIds: full.authorProfileIds as string[],
    });
  }, [loadingPost, full]);

  async function save() {
    if (!draft) return;
    if (reason.trim().length === 0) {
      setError("Give a reason for the change; it is recorded on the revision.");
      return;
    }
    const publishOn = draft.publishOn.trim() === "" ? Date.now() : fromLocalInput(draft.publishOn);
    if (publishOn === null) {
      setError("Write the publish time as YYYY-MM-DD HH:MM.");
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
        authorProfileIds: draft.authorProfileIds as Id<"profiles">[],
        reason,
      };
      if (draft.id) await update({ ...payload, id: draft.id });
      else await create(payload);
      setMessage({ tone: "ok", text: `${draft.title} has been saved.` });
      setDraft(null);
      setLoadingPost(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That post could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  const columns: AdminColumn<PostRow>[] = [
    {
      key: "title",
      header: "Title",
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
      header: "Authors",
      cell: (row) =>
        row.authors.length === 0 ? (
          <span className="text-muted-foreground">{DASH}</span>
        ) : (
          row.authors.map((author) => author.displayName).join(", ")
        ),
    },
    {
      key: "state",
      header: "State",
      cell: (row) => (
        <Flags
          flags={[
            { on: row.visible, label: "Visible", tone: "good" },
            { on: !row.visible, label: "Draft", tone: "warn" },
            { on: row.sticky, label: "Sticky", tone: "accent" },
            { on: row.publishOn > Date.now(), label: "Scheduled", tone: "accent" },
          ]}
        />
      ),
    },
    {
      key: "publishOn",
      header: "Publishes",
      numeric: true,
      cell: (row) => formatDateTime(row.publishOn),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
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
            Edit
          </Button>
          <ConfirmAction
            trigger={
              <Button variant="ghost" size="sm">
                Delete
              </Button>
            }
            title={`Delete ${row.title}?`}
            description="The post and every comment on it are removed."
            confirmLabel="Delete post"
            onConfirm={async () => {
              try {
                await remove({ id: row._id, reason: "Deleted from the console" });
                setMessage({ tone: "ok", text: `${row.title} has been deleted.` });
              } catch (caught) {
                setMessage({
                  tone: "bad",
                  text: caught instanceof Error ? caught.message : "That post could not be deleted.",
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
              placeholder="Title or slug"
              ariaLabel="Search posts"
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
              New post
            </Button>
          </>
        }
        emptyTitle="No posts"
        emptyDescription="The blog is where contest announcements and editorials are published."
        emptyAction={
          <Button
            variant="secondary"
            onClick={() => setDraft({ ...EMPTY, publishOn: toLocalInput(Date.now()) })}
          >
            New post
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
        title={draft?.id ? `Edit ${draft.title}` : "New post"}
        onSubmit={save}
        reason={reason}
        onReasonChange={setReason}
        busy={busy}
        error={error}
        submitLabel={draft?.id ? "Save post" : "Create post"}
        width={880}
      >
        <FieldGroup columns={2}>
          <Field label="Title">
            <Input
              value={draft?.title ?? ""}
              maxLength={100}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, title: event.target.value } : current))
              }
            />
          </Field>
          <Field label="Slug" optional=" (optional)" hint="Left blank it is made from the title.">
            <Input
              mono
              value={draft?.slug ?? ""}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, slug: event.target.value } : current))
              }
            />
          </Field>
          <Field
            label="Authors"
            hint={
              authorOptions
                ? "Who the post is credited to."
                : "Listing accounts needs judge.change_profile, so the authors stay as they are."
            }
          >
            <MultiSelect
              options={(authorOptions ?? []).map((option) => ({ value: option.id, label: option.label }))}
              values={draft?.authorProfileIds ?? []}
              onChange={(values) =>
                setDraft((current) => (current ? { ...current, authorProfileIds: values } : current))
              }
              disabled={!authorOptions}
              searchPlaceholder="Find a member"
              emptyText="No member by that name."
            />
          </Field>
          <Field label="Publishes" hint="YYYY-MM-DD HH:MM in your own timezone.">
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

        <Field
          label="Summary"
          optional=" (optional)"
          hint="Shown on the blog list instead of the first paragraph."
        >
          <Textarea
            rows={3}
            value={draft?.summary ?? ""}
            onChange={(event) =>
              setDraft((current) => (current ? { ...current, summary: event.target.value } : current))
            }
          />
        </Field>

        <MarkdownField
          label="Content"
          hint="Markdown, rendered with the blog preset."
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
            label="Visible — members can read it once it has published"
          />
          <Checkbox
            checked={draft?.sticky ?? false}
            onCheckedChange={(value) =>
              setDraft((current) => (current ? { ...current, sticky: value } : current))
            }
            label="Sticky — pinned to the top of the blog"
          />
        </FieldGroup>
      </RecordDialog>
    </div>
  );
}
