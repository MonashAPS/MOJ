"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Badge, Button, Checkbox, Field, FieldGroup, Input, Panel, Select, Tabs, Textarea } from "@moj/ui";
import { useMutation, useQuery } from "convex/react";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("admin.organizations.editor");

  return (
    <Tabs
      panels={[
        { key: "details", label: t("tabDetails"), content: <DetailsForm organization={organization} /> },
        {
          key: "classes",
          label: t("tabClasses", { count: organization.classCount }),
          content: <Classes organization={organization} />,
        },
        {
          key: "requests",
          label:
            organization.pendingRequests > 0
              ? t("tabRequestsPending", { count: organization.pendingRequests })
              : t("tabRequests"),
          content: (
            <QueryBoundary
              title={t("requestsTitle")}
              message={t("requestsDenied", { name: organization.name })}
            >
              <Requests organization={organization} />
            </QueryBoundary>
          ),
        },
        {
          key: "history",
          label: t("tabHistory"),
          content: <RevisionsPanel rows={revisions} title={t("historyTitle", { name: organization.name })} />,
        },
      ]}
    />
  );
}

function DetailsForm({ organization }: { organization: OrganizationRow }) {
  const t = useTranslations("admin.organizations.editor");
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
      setStatus({ error: t("reasonRequired") });
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
      setStatus({ saved: t("saved", { name: draft.name }) });
      setReason("");
    } catch (error) {
      setStatus({ error: error instanceof Error ? error.message : t("saveFailed") });
    } finally {
      setBusy(false);
    }
  }

  if (!organization.canEdit) {
    return (
      <Panel title={t("detailsTitle")} bodyClassName="p-3">
        <p className="text-sm text-muted-foreground">{t("readOnly", { name: organization.name })}</p>
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
      submitLabel={t("submit")}
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
  const t = useTranslations("admin.organizations.classes");
  const actions = useTranslations("common.actions");
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
      setError(t("reasonRequired"));
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
      setMessage({ tone: "ok", text: t("saved", { name: draft.name }) });
      setDraft(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  const columns: AdminColumn<ClassRow>[] = [
    {
      key: "name",
      header: t("columnClass"),
      cell: (row) => <span className="font-medium">{row.name}</span>,
    },
    {
      key: "slug",
      header: t("columnSlug"),
      cell: (row) => <span className="font-mono text-mono">{row.slug}</span>,
    },
    { key: "members", header: t("columnMembers"), numeric: true, cell: (row) => row.memberCount },
    {
      key: "state",
      header: t("columnState"),
      cell: (row) => (
        <Flags
          flags={[
            { on: row.isActive, label: t("flagActive"), tone: "good" },
            { on: !row.isActive, label: t("flagArchived"), tone: "warn" },
            { on: row.requiresAccessCode, label: t("flagAccessCode"), tone: "accent" },
          ]}
        />
      ),
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
            {actions("edit")}
          </Button>
          <ConfirmAction
            trigger={
              <Button variant="ghost" size="sm">
                {actions("delete")}
              </Button>
            }
            title={t("deleteTitle", { name: row.name })}
            description={t("deleteDescription", {
              count: row.memberCount,
              organization: organization.name,
            })}
            confirmLabel={t("deleteConfirm")}
            onConfirm={async () => {
              try {
                await remove({ organizationSlug: organization.slug, classSlug: row.slug });
                setMessage({ tone: "ok", text: t("deleted", { name: row.name }) });
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
            <span className="text-sm text-muted-foreground">{t("toolbarNote")}</span>
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
              {t("create")}
            </Button>
          </>
        }
        emptyTitle={t("emptyTitle")}
        emptyDescription={t("emptyDescription", { name: organization.name })}
        emptyAction={
          <Button variant="secondary" onClick={() => setDraft({ ...EMPTY_CLASS })}>
            {t("create")}
          </Button>
        }
      />

      <RecordDialog
        open={draft !== null}
        onOpenChange={(next) => (next ? undefined : setDraft(null))}
        title={
          draft?.originalSlug
            ? t("dialogEditTitle", { name: draft.name })
            : t("dialogCreateTitle", { organization: organization.name })
        }
        onSubmit={save}
        reason={reason}
        onReasonChange={setReason}
        busy={busy}
        error={error}
        submitLabel={draft?.originalSlug ? t("dialogEditSubmit") : t("dialogCreateSubmit")}
      >
        <FieldGroup columns={2}>
          <Field label={t("name")}>
            <Input
              value={draft?.name ?? ""}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, name: event.target.value } : current))
              }
            />
          </Field>
          <Field label={t("slug")} hint={t("slugHint")}>
            <Input
              mono
              value={draft?.slug ?? ""}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, slug: event.target.value } : current))
              }
            />
          </Field>
          <Field label={t("admins")} hint={t("adminsHint")}>
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
          <Field label={t("accessCode")} optional={t("optional")} hint={t("accessCodeHint")}>
            <Input
              mono
              value={draft?.accessCode ?? ""}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, accessCode: event.target.value } : current))
              }
            />
          </Field>
        </FieldGroup>
        <Field label={t("description")} optional={t("optional")}>
          <Textarea
            rows={3}
            value={draft?.description ?? ""}
            onChange={(event) =>
              setDraft((current) => (current ? { ...current, description: event.target.value } : current))
            }
          />
        </Field>
        {draft?.originalSlug ? (
          <Field label={t("members")} optional={t("optional")} hint={t("membersHint")}>
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
          label={t("active")}
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
  { value: "pending", labelKey: "tabPending" },
  { value: "approved", labelKey: "tabApproved" },
  { value: "rejected", labelKey: "tabRejected" },
  { value: "log", labelKey: "tabLog" },
] as const;

function Requests({ organization }: { organization: OrganizationRow }) {
  const t = useTranslations("admin.organizations.requests");
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
      setMessage({ tone: "bad", text: caught instanceof Error ? caught.message : t("failed") });
    }
  }

  const columns: AdminColumn<RequestRow>[] = [
    { key: "user", header: t("columnMember"), cell: (row) => row.displayName },
    { key: "class", header: t("columnClass"), cell: (row) => row.className ?? DASH },
    { key: "reason", header: t("columnReason"), cell: (row) => row.reason || DASH },
    { key: "time", header: t("columnRequested"), numeric: true, cell: (row) => formatDateTime(row.time) },
    {
      key: "state",
      header: t("columnState"),
      cell: (row) => (
        <Badge variant={row.state === "P" ? "warn" : row.state === "A" ? "good" : "bad"} shape="square">
          {row.state === "P"
            ? t("statePending")
            : row.state === "A"
              ? t("stateApproved")
              : t("stateRejected")}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">{t("columnActions")}</span>,
      cell: (row) =>
        row.state === "P" ? (
          <span className="flex items-center justify-end gap-1">
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                run(() => approve({ requestId: row._id }), t("approved", { name: row.displayName }))
              }
            >
              {t("approve")}
            </Button>
            <ConfirmAction
              trigger={
                <Button variant="ghost" size="sm">
                  {t("reject")}
                </Button>
              }
              title={t("rejectTitle", { name: row.displayName })}
              description={t("rejectDescription")}
              confirmLabel={t("rejectConfirm")}
              onConfirm={() =>
                run(() => reject({ requestId: row._id }), t("rejected", { name: row.displayName }))
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
              options={REQUEST_TABS.map((option) => ({ value: option.value, label: t(option.labelKey) }))}
              value={tab}
              onValueChange={(value) => setTab(value as typeof tab)}
              ariaLabel={t("stateAria")}
              size="sm"
              className="w-[200px]"
            />
            <span className="ml-auto font-mono text-mono tabular-nums text-muted-foreground">
              {data?.slotsRemaining === null || data?.slotsRemaining === undefined
                ? ""
                : t("slotsRemaining", { count: data.slotsRemaining })}
            </span>
          </>
        }
        emptyTitle={tab === "pending" ? t("emptyPendingTitle") : t("emptyTitle")}
        emptyDescription={
          tab === "pending"
            ? t("emptyPendingDescription", { name: organization.name })
            : t("emptyDescription")
        }
      />
    </div>
  );
}
