"use client";

import { api } from "@convex/_generated/api";
import { Badge, Button, Input } from "@moj/ui";
import { useQuery } from "convex/react";
import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import {
  type AdminColumn,
  AdminFilter,
  AdminPager,
  AdminShell,
  AdminTable,
  AdminToolbar,
} from "@/components/admin";
import { formatDateTime } from "@/lib/format";

type Row = {
  key: string;
  name: string;
  startTime: number;
  endTime: number;
  isVisible: boolean;
  isRated: boolean;
  isPrivate: boolean;
  isOrganizationPrivate: boolean;
  userCount: number;
  formatName: string;
  problemCount: number;
};

const PAGE_SIZE = 50;

export function ContestsList() {
  const t = useTranslations("admin.contests.list");
  const filterLabels = useTranslations("admin.components.filters");
  const router = useRouter();
  const pathname = usePathname() ?? "/admin/contests/";
  const params = useSearchParams();
  const search = params.get("q") ?? "";
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);

  const [draft, setDraft] = useState(search);
  useEffect(() => setDraft(search), [search]);

  const data = useQuery(api.admin.contests.list, {
    search: search || undefined,
    paginationOpts: { numItems: PAGE_SIZE, cursor: String((page - 1) * PAGE_SIZE) },
  });

  function withParams(next: Record<string, string | null>): string {
    const query = new URLSearchParams(params.toString());

    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === "") query.delete(key);
      else query.set(key, value);
    }

    if (!("page" in next)) query.delete("page");
    const text = query.toString();

    return text ? `${pathname}?${text}` : pathname;
  }

  const rows: Row[] = data?.page ?? [];

  const columns: AdminColumn<Row>[] = [
    {
      key: "key",
      header: t("columnId"),
      cell: (row) => <span className="font-mono text-mono font-medium text-foreground">{row.key}</span>,
    },
    { key: "name", header: t("columnName"), cell: (row) => <span className="truncate">{row.name}</span> },
    {
      key: "start",
      header: t("columnStarts"),
      numeric: true,
      cell: (row) => formatDateTime(row.startTime),
    },
    { key: "end", header: t("columnEnds"), numeric: true, cell: (row) => formatDateTime(row.endTime) },
    {
      key: "format",
      header: t("columnFormat"),
      cell: (row) => <span className="font-mono text-sm">{row.formatName}</span>,
    },
    { key: "problems", header: t("columnProblems"), numeric: true, cell: (row) => row.problemCount },
    { key: "users", header: t("columnEntrants"), numeric: true, cell: (row) => row.userCount },
    {
      key: "flags",
      header: t("columnState"),
      cell: (row) => (
        <div className="flex flex-wrap gap-1">
          <Badge variant={row.isVisible ? "good" : "neutral"} rounding="square">
            {row.isVisible ? t("visible") : t("hidden")}
          </Badge>
          {row.isRated ? (
            <Badge variant="accent" rounding="square">
              {t("rated")}
            </Badge>
          ) : null}
          {row.isPrivate || row.isOrganizationPrivate ? (
            <Badge variant="warn" rounding="square">
              {t("private")}
            </Badge>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <AdminShell
      title={t("title")}
      breadcrumb={[{ label: t("breadcrumbConsole"), href: "/admin/" }, { label: t("title") }]}
      action={
        <Button asChild size="sm" icon={<Plus aria-hidden />}>
          <Link href="/admin/contests/new/">{t("newContest")}</Link>
        </Button>
      }
    >
      <AdminTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.key}
        href={(row) => `/admin/contests/${row.key}/`}
        loading={data === undefined}
        caption={t("caption")}
        empty={{
          title: search ? t("emptySearchTitle") : t("emptyTitle"),
          description: search ? t("emptySearchDescription", { search }) : t("emptyDescription"),
          action: search ? (
            <Button variant="secondary" size="sm" onClick={() => router.replace(pathname, { scroll: false })}>
              {t("clearFilters")}
            </Button>
          ) : undefined,
        }}
        toolbar={
          <AdminToolbar>
            <AdminFilter grow label={filterLabels("search")}>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  router.replace(withParams({ q: draft }), { scroll: false });
                }}
              >
                <Input
                  icon={<Search aria-hidden />}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={t("searchPlaceholder")}
                  aria-label={t("searchLabel")}
                  className="h-(--control-h-sm) w-full"
                />
              </form>
            </AdminFilter>
          </AdminToolbar>
        }
        footer={
          <AdminPager
            page={page}
            pageSize={PAGE_SIZE}
            total={data?.total ?? 0}
            summary={(range) => t("pagerSummary", range)}
            hrefFor={(next) => withParams({ page: String(next) })}
          />
        }
      />
    </AdminShell>
  );
}
