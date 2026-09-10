"use client";

import { api } from "@convex/_generated/api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Combobox,
  Input,
  Select,
  toast,
} from "@moj/ui";
import { useMutation } from "convex/react";
import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { type AdminColumn, AdminPager, AdminShell, AdminTable, AdminToolbar } from "@/components/admin";
import { useAdminProblemOptions, useAdminProblemsList } from "@/components/admin/fallbacks";
import { formatDate } from "@/lib/format";

type Row = {
  code: string;
  name: string;
  group: string | null;
  types: string[];
  authors: string[];
  points: number;
  partial: boolean;
  isPublic: boolean;
  isManuallyManaged: boolean;
  isOrganizationPrivate: boolean;
  date: number;
  userCount: number;
  acRate: number;
};

const PAGE_SIZE = 50;

export function ProblemsList() {
  const router = useRouter();
  const pathname = usePathname() ?? "/admin/problems/";
  const params = useSearchParams();

  const search = params.get("q") ?? "";
  const visibility = params.get("public") ?? "any";
  const group = params.get("group") ?? "";
  const type = params.get("type") ?? "";
  const author = params.get("author") ?? "";
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);

  const [draft, setDraft] = useState(search);
  useEffect(() => setDraft(search), [search]);

  const [selected, setSelected] = useState<string[]>([]);
  const [pendingVisibility, setPendingVisibility] = useState<boolean | null>(null);

  const { data: options, degraded } = useAdminProblemOptions();
  const { data } = useAdminProblemsList({
    search: search || undefined,
    isPublic: visibility === "any" ? undefined : visibility === "public",
    group: group || undefined,
    type: type || undefined,
    author: author || undefined,
    page,
    pageSize: PAGE_SIZE,
  });
  const setVisibility = useMutation(api.admin.problems.setVisibility);

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

  function go(next: Record<string, string | null>) {
    router.replace(withParams(next), { scroll: false });
  }

  const rows: Row[] = data?.items ?? [];
  const filtered = visibility !== "any" || !!group || !!type || !!author || !!search;

  const columns: AdminColumn<Row>[] = [
    {
      key: "code",
      header: "Code",
      cell: (row) => <span className="font-mono text-mono font-medium text-foreground">{row.code}</span>,
    },
    {
      key: "name",
      header: "Name",
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-foreground">{row.name}</span>
          {row.isManuallyManaged ? (
            <Badge variant="neutral" shape="square">
              Manual
            </Badge>
          ) : null}
        </div>
      ),
    },
    {
      key: "group",
      header: "Group",
      cell: (row) => <span className="text-subtle">{row.group ?? "—"}</span>,
    },
    {
      key: "types",
      header: "Types",
      cell: (row) => (
        <span className="truncate text-muted-foreground">
          {row.types.length > 0 ? row.types.join(", ") : "—"}
        </span>
      ),
    },
    {
      key: "authors",
      header: "Authors",
      cell: (row) => (
        <span className="truncate font-mono text-sm text-muted-foreground">
          {row.authors.length > 0 ? row.authors.join(", ") : "—"}
        </span>
      ),
    },
    {
      key: "points",
      header: "Points",
      numeric: true,
      cell: (row) => (
        <>
          {row.points}
          {row.partial ? <span className="text-muted-foreground">p</span> : null}
        </>
      ),
    },
    {
      key: "acRate",
      header: "AC %",
      numeric: true,
      cell: (row) => `${row.acRate.toFixed(1)}%`,
    },
    { key: "users", header: "Users", numeric: true, cell: (row) => row.userCount },
    {
      key: "visibility",
      header: "Visibility",
      cell: (row) => (
        <Badge variant={row.isPublic ? "good" : "neutral"} shape="square">
          {row.isPublic ? "Public" : row.isOrganizationPrivate ? "Organisation" : "Private"}
        </Badge>
      ),
    },
    {
      key: "date",
      header: "Published",
      numeric: true,
      cell: (row) => formatDate(row.date),
    },
  ];

  async function applyVisibility(isPublic: boolean) {
    try {
      const result = await setVisibility({ codes: selected, isPublic, reason: "Bulk visibility change" });
      const count = result?.changed?.length ?? selected.length;
      toast.success(
        `${count} ${count === 1 ? "problem" : "problems"} marked ${isPublic ? "public" : "private"}`,
      );
      setSelected([]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The change was refused.");
    }
    setPendingVisibility(null);
  }

  return (
    <AdminShell
      title="Problems"
      breadcrumb={[{ label: "Staff console", href: "/admin/" }, { label: "Problems" }]}
      action={
        <Button asChild size="sm" icon={<Plus aria-hidden />}>
          <Link href="/admin/problems/new/">New problem</Link>
        </Button>
      }
    >
      <AdminTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.code}
        href={(row) => `/admin/problems/${row.code}/`}
        loading={data === undefined}
        caption="Problems you may edit"
        selection={{ selected, onChange: setSelected }}
        bulkActions={[
          { label: "Make public", onSelect: () => setPendingVisibility(true) },
          { label: "Make private", onSelect: () => setPendingVisibility(false) },
        ]}
        empty={{
          title: filtered ? "No problems match" : "No problems yet",
          description: filtered
            ? "No problems match these filters."
            : "Problems appear here once one is created or uploaded by a problem repo.",
          action: filtered ? (
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
                go({ q: draft });
              }}
            >
              <Input
                icon={<Search aria-hidden />}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Code or name"
                aria-label="Search problems"
                className="h-(--control-h-sm) w-[220px]"
              />
            </form>
            <Select
              size="sm"
              ariaLabel="Visibility"
              value={visibility}
              onValueChange={(value) => go({ public: value === "any" ? null : value })}
              options={[
                { value: "any", label: "Any visibility" },
                { value: "public", label: "Public" },
                { value: "private", label: "Private" },
              ]}
              className="w-[150px]"
            />
            <Select
              size="sm"
              ariaLabel="Group"
              disabled={degraded}
              placeholder="Any group"
              value={group || "all"}
              onValueChange={(value) => go({ group: value === "all" ? null : value })}
              options={[
                { value: "all", label: "Any group" },
                ...(options?.groups ?? []).map((row) => ({ value: row.name, label: row.fullName })),
              ]}
              className="w-[170px]"
            />
            <Select
              size="sm"
              ariaLabel="Type"
              disabled={degraded}
              value={type || "all"}
              onValueChange={(value) => go({ type: value === "all" ? null : value })}
              options={[
                { value: "all", label: "Any type" },
                ...(options?.types ?? []).map((row) => ({ value: row.name, label: row.fullName })),
              ]}
              className="w-[170px]"
            />
            <Combobox
              disabled={degraded}
              value={author}
              onValueChange={(value) => go({ author: value === author ? null : value })}
              options={(options?.authors ?? []).map((name) => ({ value: name, label: name }))}
              placeholder="Any author"
              searchPlaceholder="Username"
              emptyText="No author matches."
              ariaLabel="Author"
              className="h-(--control-h-sm) w-[180px] text-sm"
            />
          </AdminToolbar>
        }
        footer={
          <AdminPager
            page={page}
            pageSize={PAGE_SIZE}
            total={data?.total ?? 0}
            noun="problem"
            hrefFor={(next) => withParams({ page: String(next) })}
          />
        }
      />

      <AlertDialog
        open={pendingVisibility !== null}
        onOpenChange={(open) => {
          if (!open) setPendingVisibility(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingVisibility ? "Make these problems public?" : "Make these problems private?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selected.length} {selected.length === 1 ? "problem" : "problems"} will be marked{" "}
              {pendingVisibility ? "public" : "private"} and rescored. Submissions are kept either way.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => applyVisibility(pendingVisibility === true)}>
              {pendingVisibility ? "Make public" : "Make private"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminShell>
  );
}
