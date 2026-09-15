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
import { useMutation, useQuery } from "convex/react";
import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { type AdminColumn, AdminPager, AdminShell, AdminTable, AdminToolbar } from "@/components/admin";
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
  const t = useTranslations("admin.problems.list");
  const shared = useTranslations("admin.problems.shared");
  const actions = useTranslations("common.actions");
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

  const options = useQuery(api.pages.admin.problems.options, {});

  const data = useQuery(api.pages.admin.problems.list, {
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
      header: t("column.code"),
      cell: (row) => <span className="font-mono text-mono font-medium text-foreground">{row.code}</span>,
    },
    {
      key: "name",
      header: t("column.name"),
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-foreground">{row.name}</span>
          {row.isManuallyManaged ? (
            <Badge variant="neutral" shape="square">
              {t("manual")}
            </Badge>
          ) : null}
        </div>
      ),
    },
    {
      key: "group",
      header: t("column.group"),
      cell: (row) => <span className="text-subtle">{row.group ?? "—"}</span>,
    },
    {
      key: "types",
      header: t("column.types"),
      cell: (row) => (
        <span className="truncate text-muted-foreground">
          {row.types.length > 0 ? row.types.join(", ") : "—"}
        </span>
      ),
    },
    {
      key: "authors",
      header: t("column.authors"),
      cell: (row) => (
        <span className="truncate font-mono text-sm text-muted-foreground">
          {row.authors.length > 0 ? row.authors.join(", ") : "—"}
        </span>
      ),
    },
    {
      key: "points",
      header: t("column.points"),
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
      header: t("column.acRate"),
      numeric: true,
      cell: (row) => `${row.acRate.toFixed(1)}%`,
    },
    { key: "users", header: t("column.users"), numeric: true, cell: (row) => row.userCount },
    {
      key: "visibility",
      header: t("column.visibility"),
      cell: (row) => (
        <Badge variant={row.isPublic ? "good" : "neutral"} shape="square">
          {row.isPublic ? t("public") : row.isOrganizationPrivate ? t("organization") : t("private")}
        </Badge>
      ),
    },
    {
      key: "date",
      header: t("column.published"),
      numeric: true,
      cell: (row) => formatDate(row.date),
    },
  ];

  async function applyVisibility(isPublic: boolean) {
    try {
      const result = await setVisibility({ codes: selected, isPublic, reason: "Bulk visibility change" });
      const count = result?.changed?.length ?? selected.length;
      toast.success(isPublic ? t("markedPublic", { count }) : t("markedPrivate", { count }));
      setSelected([]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : shared("changeRefused"));
    }

    setPendingVisibility(null);
  }

  return (
    <AdminShell
      title={t("title")}
      breadcrumb={[{ label: shared("consoleCrumb"), href: "/admin/" }, { label: shared("problemsCrumb") }]}
      action={
        <Button asChild size="sm" icon={<Plus aria-hidden />}>
          <Link href="/admin/problems/new/">{t("newProblem")}</Link>
        </Button>
      }
    >
      <AdminTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.code}
        href={(row) => `/admin/problems/${row.code}/`}
        loading={data === undefined}
        caption={t("caption")}
        selection={{ selected, onChange: setSelected }}
        selectAllLabel={t("selectAll")}
        bulkActions={[
          { label: t("bulkMakePublic"), onSelect: () => setPendingVisibility(true) },
          { label: t("bulkMakePrivate"), onSelect: () => setPendingVisibility(false) },
        ]}
        empty={{
          title: filtered ? t("emptyFilteredTitle") : t("emptyTitle"),
          description: filtered ? t("emptyFilteredDescription") : t("emptyDescription"),
          action: filtered ? (
            <Button variant="secondary" size="sm" onClick={() => router.replace(pathname, { scroll: false })}>
              {t("clearFilters")}
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
                placeholder={t("searchPlaceholder")}
                aria-label={t("searchLabel")}
                className="h-(--control-h-sm) w-[220px]"
              />
            </form>
            <Select
              size="sm"
              ariaLabel={t("visibilityFilter")}
              value={visibility}
              onValueChange={(value) => go({ public: value === "any" ? null : value })}
              options={[
                { value: "any", label: t("anyVisibility") },
                { value: "public", label: t("public") },
                { value: "private", label: t("private") },
              ]}
              className="w-[150px]"
            />
            <Select
              size="sm"
              ariaLabel={t("groupFilter")}
              placeholder={t("anyGroup")}
              value={group || "all"}
              onValueChange={(value) => go({ group: value === "all" ? null : value })}
              options={[
                { value: "all", label: t("anyGroup") },
                ...(options?.groups ?? []).map((row) => ({ value: row.name, label: row.fullName })),
              ]}
              className="w-[170px]"
            />
            <Select
              size="sm"
              ariaLabel={t("typeFilter")}
              value={type || "all"}
              onValueChange={(value) => go({ type: value === "all" ? null : value })}
              options={[
                { value: "all", label: t("anyType") },
                ...(options?.types ?? []).map((row) => ({ value: row.name, label: row.fullName })),
              ]}
              className="w-[170px]"
            />
            <Combobox
              value={author}
              onValueChange={(value) => go({ author: value === author ? null : value })}
              options={(options?.authors ?? []).map((name) => ({ value: name, label: name }))}
              placeholder={t("anyAuthor")}
              searchPlaceholder={t("authorSearchPlaceholder")}
              emptyText={t("noAuthorMatch")}
              ariaLabel={t("authorFilter")}
              className="h-(--control-h-sm) w-[180px] text-sm"
            />
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

      <AlertDialog
        open={pendingVisibility !== null}
        onOpenChange={(open) => {
          if (!open) setPendingVisibility(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingVisibility ? t("confirmPublicTitle") : t("confirmPrivateTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingVisibility
                ? t("confirmPublicBody", { count: selected.length })
                : t("confirmPrivateBody", { count: selected.length })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{actions("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => applyVisibility(pendingVisibility === true)}>
              {pendingVisibility ? t("confirmPublicAction") : t("confirmPrivateAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminShell>
  );
}
