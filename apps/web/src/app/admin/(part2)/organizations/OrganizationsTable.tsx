"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Button, Select } from "@moj/ui";
import { useMutation, useQuery } from "convex/react";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { type AdminColumn, AdminTable } from "@/components/admin/AdminTable";
import { ConfirmAction, DASH, Flags, SearchBox, StatusLine } from "../_components/console";
import { RecordDialog } from "../_components/RecordDialog";
import {
  EMPTY_ORGANIZATION,
  type OrganizationDraft,
  OrganizationFields,
  parseUsernames,
} from "./OrganizationFields";

type OrganizationRow = {
  _id: Id<"organizations">;
  name: string;
  slug: string;
  shortName: string;
  isOpen: boolean;
  classRequired: boolean;
  slots: number | null;
  accessCode: string | null;
  memberCount: number;
  adminUsernames: string[];
  classCount: number;
  pendingRequests: number;
  canEdit: boolean;
};

const OPEN_OPTIONS = [
  { value: "any", label: "Any enrollment" },
  { value: "open", label: "Open enrollment" },
  { value: "closed", label: "By request only" },
];

export function OrganizationsTable() {
  const [search, setSearch] = useState("");
  const [openness, setOpenness] = useState("any");

  const rows = useQuery(api.admin.organizations.list, {
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(openness === "any" ? {} : { isOpen: openness === "open" }),
  }) as OrganizationRow[] | undefined;

  const create = useMutation(api.admin.organizations.create);
  const remove = useMutation(api.admin.organizations.remove);
  const recount = useMutation(api.admin.organizations.recountMembers);

  const [draft, setDraft] = useState<OrganizationDraft | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  async function save() {
    if (!draft) return;
    if (reason.trim().length === 0) {
      setError("Give a reason for the change; it is recorded on the revision.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await create({
        name: draft.name,
        slug: draft.slug,
        shortName: draft.shortName,
        about: draft.about,
        isOpen: draft.isOpen,
        classRequired: draft.classRequired,
        slots: draft.slots.trim() === "" ? null : Number(draft.slots),
        accessCode: draft.accessCode,
        logoOverrideImage: draft.logoOverrideImage,
        adminUsernames: parseUsernames(draft.adminUsernames),
      });
      setMessage({ tone: "ok", text: `${draft.name} has been created.` });
      setDraft(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That organization could not be created.");
    } finally {
      setBusy(false);
    }
  }

  const columns: AdminColumn<OrganizationRow>[] = [
    {
      key: "name",
      header: "Organization",
      cell: (row) => (
        <span className="grid">
          <Link className="font-medium text-link hover:underline" href={`/admin/organizations/${row.slug}/`}>
            {row.name}
          </Link>
          <span className="font-mono text-mono text-muted-foreground">{row.slug}</span>
        </span>
      ),
    },
    { key: "short", header: "Short name", cell: (row) => row.shortName || DASH },
    { key: "admins", header: "Admins", cell: (row) => row.adminUsernames.join(", ") || DASH },
    {
      key: "members",
      header: "Members",
      numeric: true,
      cell: (row) => (row.slots === null ? row.memberCount : `${row.memberCount} / ${row.slots}`),
    },
    { key: "classes", header: "Classes", numeric: true, cell: (row) => row.classCount },
    {
      key: "pending",
      header: "Pending",
      numeric: true,
      cell: (row) =>
        row.pendingRequests === 0 ? (
          <span className="text-muted-foreground">{DASH}</span>
        ) : (
          row.pendingRequests
        ),
    },
    {
      key: "state",
      header: "Enrollment",
      cell: (row) => (
        <Flags
          flags={[
            { on: row.isOpen, label: "Open", tone: "good" },
            { on: !row.isOpen, label: "By request", tone: "warn" },
            { on: row.classRequired, label: "Class required", tone: "accent" },
            { on: row.accessCode !== null, label: "Access code", tone: "accent" },
          ]}
        />
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      cell: (row) => (
        <span className="flex items-center justify-end gap-1">
          {row.canEdit ? (
            <Button asChild variant="secondary" size="sm">
              <Link href={`/admin/organizations/${row.slug}/`}>Edit</Link>
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              disabled
              title="You are not an administrator of this organization."
            >
              Edit
            </Button>
          )}
          <ConfirmAction
            trigger={
              <Button variant="ghost" size="sm">
                Delete
              </Button>
            }
            title={`Delete ${row.name}?`}
            description={`Its ${row.memberCount} ${row.memberCount === 1 ? "membership" : "memberships"}, ${row.classCount} ${row.classCount === 1 ? "class" : "classes"} and every join request are removed. The accounts themselves stay.`}
            confirmLabel="Delete organization"
            onConfirm={async () => {
              try {
                await remove({ slug: row.slug });
                setMessage({ tone: "ok", text: `${row.name} has been deleted.` });
              } catch (caught) {
                setMessage({
                  tone: "bad",
                  text: caught instanceof Error ? caught.message : "That organization could not be deleted.",
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
              placeholder="Name"
              ariaLabel="Search organizations"
            />
            <Select
              options={OPEN_OPTIONS}
              value={openness}
              onValueChange={setOpenness}
              ariaLabel="Enrollment"
              size="sm"
              className="w-[184px]"
            />
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={async () => {
                try {
                  const fixed = await recount({});
                  setMessage({
                    tone: "ok",
                    text:
                      fixed === 0
                        ? "Every member count already matched."
                        : `${fixed} ${fixed === 1 ? "count was" : "counts were"} corrected.`,
                  });
                } catch (caught) {
                  setMessage({
                    tone: "bad",
                    text: caught instanceof Error ? caught.message : "The counts could not be recalculated.",
                  });
                }
              }}
            >
              Recount members
            </Button>
            <Button
              size="sm"
              icon={<Plus aria-hidden />}
              onClick={() => {
                setDraft({ ...EMPTY_ORGANIZATION });
                setReason("");
                setError(null);
              }}
            >
              New organization
            </Button>
          </>
        }
        emptyTitle="No organizations match"
        emptyDescription="An organisation groups members and can keep its own problems and contests private."
        emptyAction={
          <Button
            variant="secondary"
            onClick={() => {
              setSearch("");
              setOpenness("any");
            }}
          >
            Clear filters
          </Button>
        }
      />

      <RecordDialog
        open={draft !== null}
        onOpenChange={(next) => (next ? undefined : setDraft(null))}
        title="New organization"
        onSubmit={save}
        reason={reason}
        onReasonChange={setReason}
        busy={busy}
        error={error}
        submitLabel="Create organization"
        width={880}
      >
        {draft ? (
          <OrganizationFields
            draft={draft}
            onChange={(patch) => setDraft((current) => (current ? { ...current, ...patch } : current))}
          />
        ) : null}
      </RecordDialog>
    </div>
  );
}
