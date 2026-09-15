"use client";

import { api } from "@convex/_generated/api";
import { Button, Select } from "@moj/ui";
import { useMutation, useQuery } from "convex/react";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  type AdminColumn,
  AdminFilter,
  AdminTable,
  AdminToolbar,
  ConfirmAction,
  DASH,
  Flags,
  RecordDialog,
  SearchBox,
  StatusLine,
} from "@/components/admin";
import { chosenValue } from "@/lib/choices";
import {
  EMPTY_ORGANIZATION,
  type OrganizationDraft,
  OrganizationFields,
  parseUsernames,
} from "./OrganizationFields";

type OrganizationRow = FunctionReturnType<typeof api.admin.organizations.list>[number];

type OrganizationFilters = FunctionArgs<typeof api.admin.organizations.list>;

const OPEN_OPTIONS = [
  { value: "any", labelKey: "opennessAny" },
  { value: "open", labelKey: "opennessOpen" },
  { value: "closed", labelKey: "opennessClosed" },
] as const;

export function OrganizationsTable() {
  const t = useTranslations("admin.organizations.list");
  const filterLabels = useTranslations("admin.components.filters");
  const actions = useTranslations("common.actions");
  const [search, setSearch] = useState("");
  const [openness, setOpenness] = useState<(typeof OPEN_OPTIONS)[number]["value"]>("any");

  const filters: OrganizationFilters = {};
  const needle = search.trim();

  if (needle) filters.search = needle;

  if (openness !== "any") filters.isOpen = openness === "open";

  const rows = useQuery(api.admin.organizations.list, filters);

  const create = useMutation(api.admin.organizations.create);
  const remove = useMutation(api.admin.organizations.remove);
  const recount = useMutation(api.admin.organizations.recountMembers);

  const [draft, setDraft] = useState<OrganizationDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  async function save() {
    if (!draft) return;
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
      setMessage({ tone: "ok", text: t("created", { name: draft.name }) });
      setDraft(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("createFailed"));
    } finally {
      setBusy(false);
    }
  }

  const columns: AdminColumn<OrganizationRow>[] = [
    {
      key: "name",
      header: t("columnOrganization"),
      cell: (row) => (
        <span className="grid">
          <Link className="font-medium text-link hover:underline" href={`/admin/organizations/${row.slug}/`}>
            {row.name}
          </Link>
          <span className="font-mono text-mono text-muted-foreground">{row.slug}</span>
        </span>
      ),
    },
    { key: "short", header: t("columnShortName"), cell: (row) => row.shortName || DASH },
    { key: "admins", header: t("columnAdmins"), cell: (row) => row.adminUsernames.join(", ") || DASH },
    {
      key: "members",
      header: t("columnMembers"),
      numeric: true,
      cell: (row) => (row.slots === null ? row.memberCount : `${row.memberCount} / ${row.slots}`),
    },
    { key: "classes", header: t("columnClasses"), numeric: true, cell: (row) => row.classCount },
    {
      key: "pending",
      header: t("columnPending"),
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
      header: t("columnEnrollment"),
      cell: (row) => (
        <Flags
          flags={[
            { on: row.isOpen, label: t("flagOpen"), tone: "good" },
            { on: !row.isOpen, label: t("flagByRequest"), tone: "warn" },
            { on: row.classRequired, label: t("flagClassRequired"), tone: "accent" },
            { on: row.accessCode !== null, label: t("flagAccessCode"), tone: "accent" },
          ]}
        />
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">{t("columnActions")}</span>,
      cell: (row) => (
        <span className="flex items-center justify-end gap-1">
          {row.canEdit ? (
            <Button asChild variant="secondary" size="sm">
              <Link href={`/admin/organizations/${row.slug}/`}>{actions("edit")}</Link>
            </Button>
          ) : (
            <Button variant="secondary" size="sm" disabled title={t("editDenied")}>
              {actions("edit")}
            </Button>
          )}
          <ConfirmAction
            trigger={
              <Button variant="ghost" size="sm">
                {actions("delete")}
              </Button>
            }
            title={t("deleteTitle", { name: row.name })}
            description={t("deleteDescription", {
              members: row.memberCount,
              classes: row.classCount,
            })}
            confirmLabel={t("deleteConfirm")}
            onConfirm={async () => {
              try {
                await remove({ slug: row.slug });
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
          <AdminToolbar
            action={
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    try {
                      const fixed = await recount({});
                      setMessage({
                        tone: "ok",
                        text: fixed === 0 ? t("recountClean") : t("recountFixed", { count: fixed }),
                      });
                    } catch (caught) {
                      setMessage({
                        tone: "bad",
                        text: caught instanceof Error ? caught.message : t("recountFailed"),
                      });
                    }
                  }}
                >
                  {t("recount")}
                </Button>
                <Button
                  size="sm"
                  icon={<Plus aria-hidden />}
                  onClick={() => {
                    setDraft({ ...EMPTY_ORGANIZATION });
                    setError(null);
                  }}
                >
                  {t("create")}
                </Button>
              </>
            }
          >
            <AdminFilter grow label={filterLabels("search")}>
              <SearchBox
                value={search}
                onChange={setSearch}
                placeholder={t("searchPlaceholder")}
                ariaLabel={t("searchAria")}
              />
            </AdminFilter>
            <AdminFilter label={t("opennessAria")} className="min-w-48">
              <Select
                options={OPEN_OPTIONS.map((option) => ({ value: option.value, label: t(option.labelKey) }))}
                value={openness}
                onValueChange={(value) => setOpenness(chosenValue(OPEN_OPTIONS, value, "any"))}
                ariaLabel={t("opennessAria")}
                size="sm"
              />
            </AdminFilter>
          </AdminToolbar>
        }
        emptyTitle={t("emptyTitle")}
        emptyDescription={t("emptyDescription")}
        emptyAction={
          <Button
            variant="secondary"
            onClick={() => {
              setSearch("");
              setOpenness("any");
            }}
          >
            {t("clearFilters")}
          </Button>
        }
      />

      <RecordDialog
        open={draft !== null}
        onOpenChange={(next) => (next ? undefined : setDraft(null))}
        title={t("dialogTitle")}
        onSubmit={save}
        busy={busy}
        error={error}
        submitLabel={t("dialogSubmit")}
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
