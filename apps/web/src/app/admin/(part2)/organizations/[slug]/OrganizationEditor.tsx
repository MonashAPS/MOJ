"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Badge, Button, Checkbox, Field, FieldGroup, Input, Panel, Select, Tabs, Textarea } from "@moj/ui";
import { useMutation, useQuery } from "convex/react";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { AdminForm } from "@/components/admin/AdminForm";
import { type AdminColumn, AdminTable } from "@/components/admin/AdminTable";
import { type RevisionRow, RevisionsPanel } from "@/components/admin/RevisionsPanel";
import { formatDateTime } from "@/lib/format";
import { ConfirmAction, DASH, Flags, StatusLine } from "../../_components/console";
import { QueryBoundary } from "../../_components/QueryBoundary";
import { RecordDialog } from "../../_components/RecordDialog";
import { type OrganizationDraft, OrganizationFields, parseUsernames } from "../OrganizationFields";

type OrganizationRow = {
  _id: Id<"organizations">;
  name: string;
  slug: string;
  shortName: string;
  about: string;
  isOpen: boolean;
  classRequired: boolean;
  slots: number | null;
  accessCode: string | null;
  logoOverrideImage?: string;
  memberCount: number;
  adminUsernames: string[];
  classCount: number;
  pendingRequests: number;
  canEdit: boolean;
};

export function OrganizationEditor({
  organization,
  revisions,
}: {
  organization: OrganizationRow;
  revisions: RevisionRow[] | null;
}) {
  return (
    <Tabs
      panels={[
        { key: "details", label: "Details", content: <DetailsForm organization={organization} /> },
        {
          key: "classes",
          label: `Classes (${organization.classCount})`,
          content: <Classes organization={organization} />,
        },
        {
          key: "requests",
          label: `Join requests${organization.pendingRequests > 0 ? ` (${organization.pendingRequests})` : ""}`,
          content: (
            <QueryBoundary
              title="Join requests"
              message={`Only an administrator of ${organization.name}, or of one of its classes, can review its join requests. That is DMOJ's rule, and it holds for superusers too.`}
            >
              <Requests organization={organization} />
            </QueryBoundary>
          ),
        },
        {
          key: "history",
          label: "History",
          content: <RevisionsPanel rows={revisions} title={`Changes to ${organization.name}`} />,
        },
      ]}
    />
  );
}

function DetailsForm({ organization }: { organization: OrganizationRow }) {
  const update = useMutation(api.admin.organizations.update);

  const initial: OrganizationDraft = useMemo(
    () => ({
      name: organization.name,
      slug: organization.slug,
      shortName: organization.shortName,
      about: organization.about,
      isOpen: organization.isOpen,
      classRequired: organization.classRequired,
      slots: organization.slots === null ? "" : String(organization.slots),
      accessCode: organization.accessCode ?? "",
      logoOverrideImage: organization.logoOverrideImage ?? "",
      adminUsernames: organization.adminUsernames.join(", "),
    }),
    [organization],
  );

  const [draft, setDraft] = useState(initial);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ error?: string; saved?: string }>({});

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  async function save() {
    if (reason.trim().length === 0) {
      setStatus({ error: "Give a reason for the change; it is recorded on the revision." });
      return;
    }
    setBusy(true);
    try {
      await update({
        slug: organization.slug,
        newSlug: draft.slug,
        name: draft.name,
        shortName: draft.shortName,
        about: draft.about,
        isOpen: draft.isOpen,
        classRequired: draft.classRequired,
        slots: draft.slots.trim() === "" ? null : Number(draft.slots),
        accessCode: draft.accessCode === "" ? null : draft.accessCode,
        logoOverrideImage: draft.logoOverrideImage,
        adminUsernames: parseUsernames(draft.adminUsernames),
        reason,
      });
      setStatus({ saved: `${draft.name} has been saved.` });
      setReason("");
    } catch (error) {
      setStatus({ error: error instanceof Error ? error.message : "That could not be saved." });
    } finally {
      setBusy(false);
    }
  }

  if (!organization.canEdit) {
    return (
      <Panel title="Details" bodyClassName="p-3">
        <p className="text-sm text-muted-foreground">
          You are not an administrator of {organization.name}, so its details are read-only here.
        </p>
      </Panel>
    );
  }

  return (
    <AdminForm
      onSubmit={save}
      reason={reason}
      onReasonChange={setReason}
      dirty={dirty}
      busy={busy}
      error={status.error ?? null}
      saved={status.saved ?? null}
      submitLabel="Save organization"
    >
      <OrganizationFields
        draft={draft}
        lockSlug
        onChange={(patch) => {
          setDraft((current) => ({ ...current, ...patch }));
          setStatus({});
        }}
      />
    </AdminForm>
  );
}

type ClassRow = {
  _id: Id<"classes">;
  name: string;
  slug: string;
  isActive: boolean;
  memberCount: number;
  requiresAccessCode: boolean;
};

type ClassDraft = {
  originalSlug: string | null;
  name: string;
  slug: string;
  description: string;
  isActive: boolean;
  accessCode: string;
  adminUsernames: string;
  memberUsernames: string;
};

const EMPTY_CLASS: ClassDraft = {
  originalSlug: null,
  name: "",
  slug: "",
  description: "",
  isActive: true,
  accessCode: "",
  adminUsernames: "",
  memberUsernames: "",
};

function Classes({ organization }: { organization: OrganizationRow }) {
  const rows = useQuery(api.classes.listForOrganization, {
    organizationSlug: organization.slug,
    activeOnly: false,
  }) as ClassRow[] | undefined;

  const create = useMutation(api.classes.create);
  const update = useMutation(api.classes.update);
  const setMembers = useMutation(api.classes.setMembers);
  const remove = useMutation(api.classes.remove);

  const [draft, setDraft] = useState<ClassDraft | null>(null);
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
      if (draft.originalSlug) {
        await update({
          organizationSlug: organization.slug,
          classSlug: draft.originalSlug,
          name: draft.name,
          slug: draft.slug,
          description: draft.description,
          isActive: draft.isActive,
          accessCode: draft.accessCode,
          adminUsernames: parseUsernames(draft.adminUsernames),
        });
        if (draft.memberUsernames.trim() !== "") {
          await setMembers({
            organizationSlug: organization.slug,
            classSlug: draft.slug,
            usernames: parseUsernames(draft.memberUsernames),
          });
        }
      } else {
        await create({
          organizationSlug: organization.slug,
          name: draft.name,
          slug: draft.slug,
          description: draft.description,
          isActive: draft.isActive,
          accessCode: draft.accessCode,
          adminUsernames: parseUsernames(draft.adminUsernames),
        });
      }
      setMessage({ tone: "ok", text: `${draft.name} has been saved.` });
      setDraft(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That class could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  const columns: AdminColumn<ClassRow>[] = [
    { key: "name", header: "Class", cell: (row) => <span className="font-medium">{row.name}</span> },
    { key: "slug", header: "Slug", cell: (row) => <span className="font-mono text-mono">{row.slug}</span> },
    { key: "members", header: "Members", numeric: true, cell: (row) => row.memberCount },
    {
      key: "state",
      header: "State",
      cell: (row) => (
        <Flags
          flags={[
            { on: row.isActive, label: "Active", tone: "good" },
            { on: !row.isActive, label: "Archived", tone: "warn" },
            { on: row.requiresAccessCode, label: "Access code", tone: "accent" },
          ]}
        />
      ),
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
              setDraft({
                originalSlug: row.slug,
                name: row.name,
                slug: row.slug,
                description: "",
                isActive: row.isActive,
                accessCode: "",
                adminUsernames: "",
                memberUsernames: "",
              });
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
            title={`Delete ${row.name}?`}
            description={`Its ${row.memberCount} ${row.memberCount === 1 ? "member stays" : "members stay"} in ${organization.name}; only the class goes.`}
            confirmLabel="Delete class"
            onConfirm={async () => {
              try {
                await remove({ organizationSlug: organization.slug, classSlug: row.slug });
                setMessage({ tone: "ok", text: `${row.name} has been deleted.` });
              } catch (caught) {
                setMessage({
                  tone: "bad",
                  text: caught instanceof Error ? caught.message : "That class could not be deleted.",
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
            <span className="text-sm text-muted-foreground">
              Classes split an organisation into groups with their own admins and join requests.
            </span>
            <Button
              className="ml-auto"
              size="sm"
              icon={<Plus aria-hidden />}
              onClick={() => {
                setDraft({ ...EMPTY_CLASS });
                setReason("");
                setError(null);
              }}
            >
              New class
            </Button>
          </>
        }
        emptyTitle="No classes"
        emptyDescription={`${organization.name} has one flat membership list.`}
        emptyAction={
          <Button variant="secondary" onClick={() => setDraft({ ...EMPTY_CLASS })}>
            New class
          </Button>
        }
      />

      <RecordDialog
        open={draft !== null}
        onOpenChange={(next) => (next ? undefined : setDraft(null))}
        title={draft?.originalSlug ? `Edit ${draft.name}` : `New class in ${organization.name}`}
        onSubmit={save}
        reason={reason}
        onReasonChange={setReason}
        busy={busy}
        error={error}
        submitLabel={draft?.originalSlug ? "Save class" : "Create class"}
      >
        <FieldGroup columns={2}>
          <Field label="Name">
            <Input
              value={draft?.name ?? ""}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, name: event.target.value } : current))
              }
            />
          </Field>
          <Field label="Slug" hint="Used in the class URL.">
            <Input
              mono
              value={draft?.slug ?? ""}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, slug: event.target.value } : current))
              }
            />
          </Field>
          <Field
            label="Class admins"
            hint="Usernames, comma separated. They can review this class's requests."
          >
            <Input
              mono
              value={draft?.adminUsernames ?? ""}
              onChange={(event) =>
                setDraft((current) =>
                  current ? { ...current, adminUsernames: event.target.value } : current,
                )
              }
            />
          </Field>
          <Field label="Access code" optional=" (optional)" hint="Needed to join this class directly.">
            <Input
              mono
              value={draft?.accessCode ?? ""}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, accessCode: event.target.value } : current))
              }
            />
          </Field>
        </FieldGroup>
        <Field label="Description" optional=" (optional)">
          <Textarea
            rows={3}
            value={draft?.description ?? ""}
            onChange={(event) =>
              setDraft((current) => (current ? { ...current, description: event.target.value } : current))
            }
          />
        </Field>
        {draft?.originalSlug ? (
          <Field
            label="Members"
            optional=" (optional)"
            hint="Usernames, comma separated. Leave blank to keep the class's current members."
          >
            <Input
              mono
              value={draft.memberUsernames}
              onChange={(event) =>
                setDraft((current) =>
                  current ? { ...current, memberUsernames: event.target.value } : current,
                )
              }
            />
          </Field>
        ) : null}
        <Checkbox
          checked={draft?.isActive ?? true}
          onCheckedChange={(value) =>
            setDraft((current) => (current ? { ...current, isActive: value } : current))
          }
          label="Active — members can still join it"
        />
      </RecordDialog>
    </div>
  );
}

type RequestRow = {
  _id: Id<"organizationRequests">;
  username: string;
  displayName: string;
  time: number;
  state: "P" | "A" | "R";
  reason: string;
  className: string | null;
};

const REQUEST_TABS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "log", label: "Everything reviewed" },
];

function Requests({ organization }: { organization: OrganizationRow }) {
  const [tab, setTab] = useState<"pending" | "approved" | "rejected" | "log">("pending");
  const data = useQuery(api.organizations.reviewRequests, { slug: organization.slug, tab });
  const approve = useMutation(api.organizations.approve);
  const reject = useMutation(api.organizations.reject);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  async function run(action: () => Promise<unknown>, ok: string) {
    try {
      await action();
      setMessage({ tone: "ok", text: ok });
    } catch (caught) {
      setMessage({ tone: "bad", text: caught instanceof Error ? caught.message : "That did not work." });
    }
  }

  const columns: AdminColumn<RequestRow>[] = [
    { key: "user", header: "Member", cell: (row) => row.displayName },
    { key: "class", header: "Class", cell: (row) => row.className ?? DASH },
    { key: "reason", header: "Reason given", cell: (row) => row.reason || DASH },
    { key: "time", header: "Requested", numeric: true, cell: (row) => formatDateTime(row.time) },
    {
      key: "state",
      header: "State",
      cell: (row) => (
        <Badge variant={row.state === "P" ? "warn" : row.state === "A" ? "good" : "bad"} shape="square">
          {row.state === "P" ? "Pending" : row.state === "A" ? "Approved" : "Rejected"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      cell: (row) =>
        row.state === "P" ? (
          <span className="flex items-center justify-end gap-1">
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                run(() => approve({ requestId: row._id }), `${row.displayName} has been let in.`)
              }
            >
              Approve
            </Button>
            <ConfirmAction
              trigger={
                <Button variant="ghost" size="sm">
                  Reject
                </Button>
              }
              title={`Reject ${row.displayName}?`}
              description="They can ask again; nothing stops them."
              confirmLabel="Reject request"
              onConfirm={() =>
                run(() => reject({ requestId: row._id }), `${row.displayName}'s request has been rejected.`)
              }
            />
          </span>
        ) : (
          <span className="text-muted-foreground">{DASH}</span>
        ),
    },
  ];

  return (
    <div className="grid gap-3">
      {message ? <StatusLine tone={message.tone}>{message.text}</StatusLine> : null}
      <AdminTable
        columns={columns}
        rows={data?.requests as RequestRow[] | undefined}
        rowKey={(row) => row._id}
        toolbar={
          <>
            <Select
              options={REQUEST_TABS}
              value={tab}
              onValueChange={(value) => setTab(value as typeof tab)}
              ariaLabel="Request state"
              size="sm"
              className="w-[200px]"
            />
            <span className="ml-auto font-mono text-mono tabular-nums text-muted-foreground">
              {data?.slotsRemaining === null || data?.slotsRemaining === undefined
                ? ""
                : `${data.slotsRemaining} places left`}
            </span>
          </>
        }
        emptyTitle={tab === "pending" ? "Nothing waiting" : "Nothing here"}
        emptyDescription={
          tab === "pending"
            ? `Nobody is asking to join ${organization.name}.`
            : "No request has reached that state yet."
        }
      />
    </div>
  );
}
