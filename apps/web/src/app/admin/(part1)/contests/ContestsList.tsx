"use client";

import { api } from "@convex/_generated/api";
import { Badge, Button, Input } from "@moj/ui";
import { useQuery } from "convex/react";
import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { type AdminColumn, AdminPager, AdminShell, AdminTable, AdminToolbar } from "@/components/admin";
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
      header: "Id",
      cell: (row) => <span className="font-mono text-mono font-medium text-foreground">{row.key}</span>,
    },
    { key: "name", header: "Name", cell: (row) => <span className="truncate">{row.name}</span> },
    {
      key: "start",
      header: "Starts",
      numeric: true,
      cell: (row) => formatDateTime(row.startTime),
    },
    { key: "end", header: "Ends", numeric: true, cell: (row) => formatDateTime(row.endTime) },
    {
      key: "format",
      header: "Format",
      cell: (row) => <span className="font-mono text-sm">{row.formatName}</span>,
    },
    { key: "problems", header: "Problems", numeric: true, cell: (row) => row.problemCount },
    { key: "users", header: "Entrants", numeric: true, cell: (row) => row.userCount },
    {
      key: "flags",
      header: "State",
      cell: (row) => (
        <div className="flex flex-wrap gap-1">
          <Badge variant={row.isVisible ? "good" : "neutral"} shape="square">
            {row.isVisible ? "Visible" : "Hidden"}
          </Badge>
          {row.isRated ? (
            <Badge variant="accent" shape="square">
              Rated
            </Badge>
          ) : null}
          {row.isPrivate || row.isOrganizationPrivate ? (
            <Badge variant="warn" shape="square">
              Private
            </Badge>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <AdminShell
      title="Contests"
      breadcrumb={[{ label: "Staff console", href: "/admin/" }, { label: "Contests" }]}
      action={
        <Button asChild size="sm" icon={<Plus aria-hidden />}>
          <Link href="/admin/contests/new/">New contest</Link>
        </Button>
      }
    >
      <AdminTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.key}
        href={(row) => `/admin/contests/${row.key}/`}
        loading={data === undefined}
        caption="Contests you may edit"
        empty={{
          title: search ? "No contests match" : "No contests yet",
          description: search ? `No contests match ${search}.` : "Contests you author or curate appear here.",
          action: search ? (
            <Button variant="secondary" size="sm" onClick={() => router.replace(pathname, { scroll: false })}>
              Clear filters
            </Button>
          ) : undefined,
        }}
        toolbar={
          <AdminToolbar>
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
                placeholder="Id or name"
                aria-label="Search contests"
                className="h-(--control-h-sm) w-[260px]"
              />
            </form>
          </AdminToolbar>
        }
        footer={
          <AdminPager
            page={page}
            pageSize={PAGE_SIZE}
            total={data?.total ?? 0}
            noun="contest"
            hrefFor={(next) => withParams({ page: String(next) })}
          />
        }
      />
    </AdminShell>
  );
}
