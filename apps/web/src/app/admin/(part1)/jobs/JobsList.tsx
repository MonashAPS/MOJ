"use client";

import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { Progress, Select } from "@moj/ui";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  type AdminColumn,
  AdminShell,
  AdminTable,
  AdminToolbar,
  JobStatusBadge,
  jobTypeLabel,
} from "@/components/admin";
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
  { value: "any", label: "Any type" },
  { value: "rejudge", label: "Rejudge" },
  { value: "rescore", label: "Rescore" },
  { value: "rescoreContest", label: "Rescore contest" },
  { value: "rateContest", label: "Rate contest" },
  { value: "rejudgeContestProblem", label: "Rejudge contest problem" },
  { value: "moss", label: "MOSS" },
  { value: "userExport", label: "Data export" },
];

const STATUSES = [
  { value: "any", label: "Any status" },
  { value: "queued", label: "Queued" },
  { value: "running", label: "Running" },
  { value: "done", label: "Done" },
  { value: "failed", label: "Failed" },
];

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
  const router = useRouter();
  const pathname = usePathname() ?? "/admin/jobs/";
  const params = useSearchParams();
  const type = params.get("type") ?? "any";
  const status = params.get("status") ?? "any";

  const jobs = useQuery(api.pages.admin1.jobsList, {
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
      header: "Type",
      cell: (row) => <span className="font-medium text-foreground">{jobTypeLabel(row.type)}</span>,
    },
    {
      key: "target",
      header: "Target",
      cell: (row) => (
        <span className="font-mono text-mono text-muted-foreground">{describeArgs(row.args)}</span>
      ),
    },
    { key: "status", header: "Status", cell: (row) => <JobStatusBadge status={row.status} /> },
    {
      key: "progress",
      header: "Progress",
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
      header: "Stage",
      cell: (row) => <span className="truncate text-muted-foreground">{row.progress.stage || "—"}</span>,
    },
    {
      key: "creator",
      header: "Started by",
      cell: (row) => <span className="font-mono text-sm">{row.createdBy ?? "system"}</span>,
    },
    {
      key: "created",
      header: "Created",
      numeric: true,
      cell: (row) => (
        <time dateTime={new Date(row.createdAt).toISOString()} title={formatDateTime(row.createdAt)}>
          {formatRelative(row.createdAt)}
        </time>
      ),
    },
    {
      key: "outcome",
      header: "Result",
      cell: (row) => (
        <span className={row.error ? "truncate text-danger-ink" : "truncate text-muted-foreground"}>
          {outcome(row)}
        </span>
      ),
    },
  ];

  return (
    <AdminShell
      title="Jobs"
      description="Rejudges, rescores and ratings. This list is live; it updates itself as they run."
      breadcrumb={[{ label: "Staff console", href: "/admin/" }, { label: "Jobs" }]}
    >
      <AdminTable
        columns={columns}
        rows={(jobs ?? []) as Row[]}
        rowKey={(row) => row.id}
        loading={jobs === undefined}
        skeletonRows={6}
        caption="Background jobs"
        empty={{
          title: type !== "any" || status !== "any" ? "No jobs match" : "No jobs yet",
          description:
            type !== "any" || status !== "any"
              ? "No jobs match these filters."
              : "A rejudge, rescore or rating started from the console appears here while it runs.",
        }}
        toolbar={
          <AdminToolbar>
            <Select
              size="sm"
              ariaLabel="Job type"
              value={type}
              onValueChange={(value) => go({ type: value === "any" ? null : value })}
              options={TYPES}
              className="w-[200px]"
            />
            <Select
              size="sm"
              ariaLabel="Job status"
              value={status}
              onValueChange={(value) => go({ status: value === "any" ? null : value })}
              options={STATUSES}
              className="w-[160px]"
            />
          </AdminToolbar>
        }
      />
    </AdminShell>
  );
}
