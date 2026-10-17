"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Button, Select, Sheet, SheetContent, SheetHeader, SheetTitle } from "@moj/ui";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { type AdminColumn, AdminFilter, AdminShell, AdminTable, AdminToolbar } from "@/components/admin";
import { ReviewForm } from "@/components/submissions/ReviewForm";
import { LocalTime, RelativeTime } from "@/components/time/LocalTime";
import { formatPoints } from "@/lib/submissionFormat";

type Row = NonNullable<FunctionReturnType<typeof api.pages.admin.review.queue>>["rows"][number];

const ANY = "any";

/**
 * `/admin/review/`: what is waiting for a staff score, oldest first. Scoring
 * one opens the next, so a reviewer can work down the queue without leaving it.
 */
export function ReviewQueue() {
  const t = useTranslations("admin.review");
  const shell = useTranslations("admin.shell");
  const router = useRouter();
  const pathname = usePathname() ?? "/admin/review/";
  const params = useSearchParams();

  const problemCode = params.get("problem") ?? "";
  const contestKey = params.get("contest") ?? "";

  const data = useQuery(api.pages.admin.review.queue, {
    problemCode: problemCode || undefined,
    contestKey: contestKey || undefined,
  });

  const [openId, setOpenId] = useState<Id<"submissions"> | null>(null);
  const rows: Row[] = data?.rows ?? [];
  const open = rows.find((row) => row.id === openId) ?? null;
  const filtered = !!problemCode || !!contestKey;

  function go(next: Record<string, string | null>) {
    const query = new URLSearchParams(params.toString());

    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === "") query.delete(key);
      else query.set(key, value);
    }

    const text = query.toString();
    router.replace(text ? `${pathname}?${text}` : pathname, { scroll: false });
  }

  function openNext(after: Id<"submissions">) {
    const index = rows.findIndex((row) => row.id === after);
    setOpenId(rows[index + 1]?.id ?? null);
  }

  const columns: AdminColumn<Row>[] = [
    { key: "id", header: t("columns.id"), numeric: true, cell: (row) => String(row.displayId) },
    {
      key: "problem",
      header: t("columns.problem"),
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-mono text-mono text-muted-foreground">{row.problemCode}</span>
          <span className="truncate">{row.problemName}</span>
        </div>
      ),
    },
    {
      key: "user",
      header: t("columns.user"),
      cell: (row) => <span className="font-mono text-sm">{row.username}</span>,
    },
    {
      key: "contest",
      header: t("columns.contest"),
      cell: (row) =>
        row.contestKey ? (
          <span className="font-mono text-sm">{row.contestKey}</span>
        ) : (
          <span className="text-muted-foreground">{t("practice")}</span>
        ),
    },
    {
      key: "language",
      header: t("columns.language"),
      cell: (row) => <span className="font-mono text-sm">{row.language}</span>,
    },
    { key: "outOf", header: t("columns.outOf"), numeric: true, cell: (row) => formatPoints(row.outOf) },
    {
      key: "submitted",
      header: t("columns.submitted"),
      numeric: true,
      cell: (row) => <RelativeTime value={row.date} />,
    },
    {
      key: "score",
      header: "",
      cell: (row) => (
        <div className="text-right">
          <Button size="sm" onClick={() => setOpenId(row.id)}>
            {t("score")}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <AdminShell
      title={t("title")}
      breadcrumb={[{ label: shell("consoleName"), href: "/admin/" }, { label: t("title") }]}
    >
      <div className="grid gap-4">
        <p className="text-sm text-muted-foreground">{t("intro")}</p>
        {data?.truncated ? (
          <p className="text-sm text-warn">{t("truncated", { count: rows.length })}</p>
        ) : null}

        <AdminTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          loading={data === undefined}
          caption={t("caption")}
          empty={{
            title: filtered ? t("emptyFilteredTitle") : t("emptyTitle"),
            description: filtered ? t("emptyFilteredDescription") : t("emptyDescription"),
            action: filtered ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => router.replace(pathname, { scroll: false })}
              >
                {t("clearFilters")}
              </Button>
            ) : undefined,
          }}
          toolbar={
            <AdminToolbar>
              <AdminFilter label={t("filters.problem")}>
                <Select
                  size="sm"
                  ariaLabel={t("filters.problem")}
                  value={problemCode || ANY}
                  onValueChange={(value) => go({ problem: value === ANY ? null : value })}
                  options={[
                    { value: ANY, label: t("filters.anyProblem") },
                    ...(data?.problems ?? []).map((row) => ({
                      value: row.code,
                      label: `${row.code} · ${row.name} (${row.count})`,
                    })),
                  ]}
                />
              </AdminFilter>
              <AdminFilter label={t("filters.contest")}>
                <Select
                  size="sm"
                  ariaLabel={t("filters.contest")}
                  value={contestKey || ANY}
                  onValueChange={(value) => go({ contest: value === ANY ? null : value })}
                  options={[
                    { value: ANY, label: t("filters.anyContest") },
                    ...(data?.contests ?? []).map((row) => ({
                      value: row.key,
                      label: `${row.name} (${row.count})`,
                    })),
                  ]}
                />
              </AdminFilter>
            </AdminToolbar>
          }
        />
      </div>

      <Sheet open={open !== null} onOpenChange={(next) => !next && setOpenId(null)}>
        <SheetContent side="right" className="w-[720px] max-w-[96vw] gap-0">
          <SheetHeader>
            <SheetTitle>{t("sheetTitle", { id: open ? String(open.displayId) : "" })}</SheetTitle>
          </SheetHeader>
          {open ? <ReviewSheet row={open} onSaved={() => openNext(open.id)} /> : null}
        </SheetContent>
      </Sheet>
    </AdminShell>
  );
}

function ReviewSheet({ row, onSaved }: { row: Row; onSaved: () => void }) {
  const t = useTranslations("admin.review");
  const source = useQuery(api.submissions.source, { submissionId: row.id });

  return (
    <div className="grid gap-4 overflow-y-auto p-4">
      <dl className="grid grid-cols-[minmax(0,110px)_minmax(0,1fr)] gap-x-3 gap-y-2 text-base">
        <dt className="text-subtle">{t("columns.problem")}</dt>
        <dd className="min-w-0">
          <Link className="text-link hover:underline" href={`/problem/${row.problemCode}`}>
            {row.problemName}
          </Link>
        </dd>
        <dt className="text-subtle">{t("columns.user")}</dt>
        <dd className="font-mono text-mono">{row.username}</dd>
        <dt className="text-subtle">{t("columns.contest")}</dt>
        <dd>{row.contestName ?? t("practice")}</dd>
        <dt className="text-subtle">{t("columns.language")}</dt>
        <dd className="font-mono text-mono">{row.language}</dd>
        <dt className="text-subtle">{t("columns.submitted")}</dt>
        <dd className="font-mono text-mono tabular-nums">
          <LocalTime value={row.date} />
        </dd>
      </dl>

      <div className="grid gap-1">
        <span className="text-sm font-medium text-foreground">{t("source")}</span>
        {source === undefined ? (
          <p className="text-sm text-muted-foreground">{t("loadingSource")}</p>
        ) : source?.canSeeSource ? (
          <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-secondary p-3 font-mono text-mono">
            {source.source}
          </pre>
        ) : (
          <p className="text-sm text-muted-foreground">{t("noSource")}</p>
        )}
      </div>

      <div className="border-t border-border pt-4">
        <ReviewForm
          key={row.id}
          submissionId={row.id}
          outOf={row.outOf}
          initialScore={null}
          initialFeedback={null}
          onSaved={onSaved}
          autoFocus
        />
      </div>

      <Button asChild size="sm" variant="ghost" className="justify-self-start">
        <Link href={`/submission/${row.displayId}/`}>{t("openStatus")}</Link>
      </Button>
    </div>
  );
}
