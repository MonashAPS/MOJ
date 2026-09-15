"use client";

import { api } from "@convex/_generated/api";
import { Progress, Select } from "@moj/ui";
import { useQuery } from "convex/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { type AdminColumn, AdminShell, AdminTable, AdminToolbar, JobStatusBadge } from "@/components/admin";
import { formatDateTime, formatRelative } from "@/lib/format";

type Row = {
  id: string;
  type: string;
  status: string;
  progress: { done: number; total: number; stage: string };
  args: unknown;
  result: unknown;
  error: string | null;
  createdBy: string | null;
  createdAt: number;
  finishedAt: number | null;
};

const TYPES = [
  "any",
  "rejudge",
  "rescore",
  "rescoreContest",
  "rateContest",
  "rejudgeContestProblem",
  "moss",
  "userExport",
] as const;

const STATUSES = ["any", "queued", "running", "done", "failed"] as const;

function describeArgs(args: unknown): string {
  if (!args || typeof args !== "object") return "—";
  const record = args as Record<string, unknown>;

  for (const field of ["problemCode", "key", "code"]) {
    const value = record[field];

    if (typeof value === "string") return value;
  }

  return "—";
}

function outcome(row: Row): string {
  if (row.error) return row.error;

  if (row.result && typeof row.result === "object") {
    const record = row.result as Record<string, unknown>;

    const parts = Object.entries(record)
      .filter(
        ([, value]) => typeof value === "number" || typeof value === "string" || typeof value === "boolean",
      )
      .map(([field, value]) => `${field}: ${value}`);

    if (parts.length > 0) return parts.join(", ");
  }

  return "—";
}

/** SPEC section 12's job list, live: `jobs` is a subscription, nothing polls. */
export function JobsList() {
  const t = useTranslations("admin.jobs.list");
  const shell = useTranslations("admin.shell");
  const router = useRouter();
  const pathname = usePathname() ?? "/admin/jobs/";
  const params = useSearchParams();
  const type = params.get("type") ?? "any";
  const status = params.get("status") ?? "any";

  const jobs = useQuery(api.pages.admin.jobs.list, {
    limit: 100,
    type: type === "any" ? undefined : type,
    status: status === "any" ? undefined : status,
  });

  function go(next: Record<string, string | null>) {
    const query = new URLSearchParams(params.toString());

    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === "") query.delete(key);
      else query.set(key, value);
    }

    const text = query.toString();
    router.replace(text ? `${pathname}?${text}` : pathname, { scroll: false });
  }

  const columns: AdminColumn<Row>[] = [
    {
      key: "type",
      header: t("columns.type"),
      cell: (row) => (
        <span className="font-medium text-foreground">
          {t.has(`types.${row.type}`) ? t(`types.${row.type}`) : row.type}
        </span>
      ),
    },
    {
      key: "target",
      header: t("columns.target"),
      cell: (row) => (
        <span className="font-mono text-mono text-muted-foreground">{describeArgs(row.args)}</span>
      ),
    },
    { key: "status", header: t("columns.status"), cell: (row) => <JobStatusBadge status={row.status} /> },
    {
      key: "progress",
      header: t("columns.progress"),
      cell: (row) => (
        <div className="flex min-w-[140px] items-center gap-2">
          <Progress
            className="w-20"
            value={
              row.progress.total > 0
                ? Math.round((row.progress.done / row.progress.total) * 100)
                : row.status === "done"
                  ? 100
                  : 0
            }
            tone={row.status === "failed" ? "bad" : row.status === "done" ? "good" : "royal"}
          />
          <span className="font-mono text-sm tabular-nums text-muted-foreground">
            {row.progress.done} / {row.progress.total}
          </span>
        </div>
      ),
    },
    {
      key: "stage",
      header: t("columns.stage"),
      cell: (row) => <span className="truncate text-muted-foreground">{row.progress.stage || "—"}</span>,
    },
    {
      key: "creator",
      header: t("columns.startedBy"),
      cell: (row) => <span className="font-mono text-sm">{row.createdBy ?? t("systemActor")}</span>,
    },
    {
      key: "created",
      header: t("columns.created"),
      numeric: true,
      cell: (row) => (
        <time dateTime={new Date(row.createdAt).toISOString()} title={formatDateTime(row.createdAt)}>
          {formatRelative(row.createdAt)}
        </time>
      ),
    },
    {
      key: "outcome",
      header: t("columns.result"),
      cell: (row) => (
        <span className={row.error ? "truncate text-danger-ink" : "truncate text-muted-foreground"}>
          {outcome(row)}
        </span>
      ),
    },
  ];

  return (
    <AdminShell
      title={t("title")}
      description={t("description")}
      breadcrumb={[{ label: shell("consoleName"), href: "/admin/" }, { label: t("title") }]}
    >
      <AdminTable
        columns={columns}
        rows={(jobs ?? []) as Row[]}
        rowKey={(row) => row.id}
        loading={jobs === undefined}
        skeletonRows={6}
        caption={t("caption")}
        empty={{
          title: type !== "any" || status !== "any" ? t("emptyFilteredTitle") : t("emptyTitle"),
          description:
            type !== "any" || status !== "any" ? t("emptyFilteredDescription") : t("emptyDescription"),
        }}
        toolbar={
          <AdminToolbar>
            <Select
              size="sm"
              ariaLabel={t("typeFilter")}
              value={type}
              onValueChange={(value) => go({ type: value === "any" ? null : value })}
              options={TYPES.map((value) => ({ value, label: t(`types.${value}`) }))}
              className="w-[200px]"
            />
            <Select
              size="sm"
              ariaLabel={t("statusFilter")}
              value={status}
              onValueChange={(value) => go({ status: value === "any" ? null : value })}
              options={STATUSES.map((value) => ({ value, label: t(`statuses.${value}`) }))}
              className="w-[160px]"
            />
          </AdminToolbar>
        }
      />
    </AdminShell>
  );
}
