"use client";

import { api } from "@convex/_generated/api";
import {
  Badge,
  Button,
  Pagination,
  RatingName,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@moj/ui";
import { useQuery } from "convex/react";
import { Mail } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState, useTransition } from "react";
import { type AdminColumn, AdminTable } from "@/components/admin/AdminTable";
import { formatDate } from "@/lib/format";
import { DASH, Flags, SearchBox, StatusLine } from "../_components/console";
import { type AccountRow, searchAccountsAction } from "./actions";

const PER_PAGE = 50;

const ROLE_OPTIONS = [
  { value: "any", labelKey: "roleAny" },
  { value: "staff", labelKey: "roleStaff" },
  { value: "superuser", labelKey: "roleSuperuser" },
  { value: "member", labelKey: "roleMember" },
] as const;

const RANK_OPTIONS = [
  { value: "any", labelKey: "rankAny" },
  { value: "user", labelKey: "rankUser" },
  { value: "setter", labelKey: "rankSetter" },
  { value: "admin", labelKey: "rankAdmin" },
] as const;

const STATE_OPTIONS = [
  { value: "any", labelKey: "stateAny" },
  { value: "unlisted", labelKey: "stateUnlisted" },
  { value: "muted", labelKey: "stateMuted" },
  { value: "deactivated", labelKey: "stateDeactivated" },
] as const;

const SEARCH_OPTIONS = [
  { value: "username", labelKey: "searchByUsername" },
  { value: "email", labelKey: "searchByEmail" },
] as const;

type Row = {
  _id: string;
  username: string;
  displayName: string;
  displayRank: string;
  points: number;
  performancePoints: number;
  problemCount: number;
  rating?: number;
  isStaff: boolean;
  isSuperuser: boolean;
  isActive: boolean;
  isUnlisted: boolean;
  mute: boolean;
  organizationSlugs: string[];
  lastAccess?: number;
};

export function UsersTable() {
  const t = useTranslations("admin.users.list");
  const actions = useTranslations("common.actions");
  const router = useRouter();
  const pathname = usePathname() ?? "/admin/users/";
  const params = useSearchParams();

  const search = params.get("q") ?? "";
  const searchBy = params.get("by") === "email" ? "email" : "username";
  const role = params.get("role") ?? "any";
  const rank = params.get("rank") ?? "any";
  const state = params.get("state") ?? "any";
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);

  const setParam = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "" || value === "any") next.delete(key);
        else next.set(key, value);
      }
      if (!("page" in updates)) next.delete("page");
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const usernameSearch = searchBy === "username" ? search.trim() : "";
  const superuserOnly = role === "superuser";

  const result = useQuery(api.admin.users.list, {
    ...(usernameSearch ? { search: usernameSearch } : {}),
    ...(role === "staff" || superuserOnly ? { isStaff: true } : {}),
    ...(role === "member" ? { isStaff: false } : {}),
    ...(rank !== "any" ? { displayRank: rank as "user" | "setter" | "admin" } : {}),
    ...(state === "unlisted" ? { isUnlisted: true } : {}),
    ...(state === "muted" ? { muted: true } : {}),
    ...(state === "deactivated" ? { isActive: false } : {}),
    page: superuserOnly ? 1 : page,
    perPage: superuserOnly ? 200 : PER_PAGE,
  });

  const rows: Row[] | undefined = result
    ? superuserOnly
      ? result.users.filter((user) => user.isSuperuser)
      : result.users
    : undefined;
  const total = result ? (superuserOnly ? (rows?.length ?? 0) : result.total) : 0;
  const totalPages = superuserOnly ? 1 : Math.max(1, Math.ceil(total / PER_PAGE));

  const columns: AdminColumn<Row>[] = [
    {
      key: "username",
      header: t("columnUsername"),
      cell: (row) => (
        <RatingName
          username={row.displayName}
          rating={row.rating}
          href={`/admin/users/${row.username}/`}
          isAdmin={row.displayRank === "admin"}
        />
      ),
    },
    {
      key: "role",
      header: t("columnRole"),
      cell: (row) =>
        row.isSuperuser ? (
          <Badge variant="primary" shape="square">
            {t("badgeSuperuser")}
          </Badge>
        ) : row.isStaff ? (
          <Badge variant="accent" shape="square">
            {t("badgeStaff")}
          </Badge>
        ) : (
          <span className="text-muted-foreground capitalize">{row.displayRank}</span>
        ),
    },
    { key: "points", header: t("columnPoints"), numeric: true, cell: (row) => row.points.toFixed(0) },
    {
      key: "pp",
      header: t("columnPerformancePoints"),
      numeric: true,
      cell: (row) => row.performancePoints.toFixed(0),
    },
    { key: "solved", header: t("columnSolved"), numeric: true, cell: (row) => row.problemCount },
    {
      key: "organizations",
      header: t("columnOrganizations"),
      cell: (row) =>
        row.organizationSlugs.length === 0 ? (
          <span className="text-muted-foreground">{DASH}</span>
        ) : (
          <span className="font-mono text-mono text-subtle">{row.organizationSlugs.join(", ")}</span>
        ),
    },
    {
      key: "flags",
      header: t("columnFlags"),
      cell: (row) => (
        <Flags
          flags={[
            { on: row.isUnlisted, label: t("flagUnlisted"), tone: "warn" },
            { on: row.mute, label: t("flagMuted"), tone: "warn" },
            { on: !row.isActive, label: t("flagDeactivated"), tone: "bad" },
          ]}
        />
      ),
    },
    {
      key: "lastAccess",
      header: t("columnLastSeen"),
      numeric: true,
      cell: (row) => (row.lastAccess ? formatDate(row.lastAccess) : DASH),
    },
    {
      key: "actions",
      header: <span className="sr-only">{t("columnActions")}</span>,
      cell: (row) => (
        <Button asChild variant="secondary" size="sm">
          <Link href={`/admin/users/${row.username}/`}>{actions("edit")}</Link>
        </Button>
      ),
    },
  ];

  return (
    <div className="grid gap-4">
      <AdminTable
        columns={columns}
        rows={searchBy === "email" ? [] : rows}
        loading={searchBy === "email" ? false : rows === undefined}
        rowKey={(row) => row._id}
        toolbar={
          <>
            <Select
              options={SEARCH_OPTIONS.map((option) => ({
                value: option.value,
                label: t(option.labelKey),
              }))}
              value={searchBy}
              onValueChange={(value) => setParam({ by: value === "username" ? null : value })}
              ariaLabel={t("searchByAria")}
              size="sm"
              className="w-[124px]"
            />
            <SearchBox
              value={search}
              onChange={(value) => setParam({ q: value })}
              placeholder={
                searchBy === "email" ? t("searchEmailPlaceholder") : t("searchUsernamePlaceholder")
              }
              ariaLabel={searchBy === "email" ? t("searchEmailAria") : t("searchUsernameAria")}
            />
            <Select
              options={ROLE_OPTIONS.map((option) => ({ value: option.value, label: t(option.labelKey) }))}
              value={role}
              onValueChange={(value) => setParam({ role: value })}
              ariaLabel={t("roleAria")}
              size="sm"
              className="w-[150px]"
            />
            <Select
              options={RANK_OPTIONS.map((option) => ({ value: option.value, label: t(option.labelKey) }))}
              value={rank}
              onValueChange={(value) => setParam({ rank: value })}
              ariaLabel={t("rankAria")}
              size="sm"
              className="w-[176px]"
            />
            <Select
              options={STATE_OPTIONS.map((option) => ({ value: option.value, label: t(option.labelKey) }))}
              value={state}
              onValueChange={(value) => setParam({ state: value })}
              ariaLabel={t("stateAria")}
              size="sm"
              className="w-[150px]"
            />
            <span className="ml-auto font-mono text-mono tabular-nums text-muted-foreground">
              {result ? t("count", { count: total }) : ""}
            </span>
          </>
        }
        emptyTitle={t("emptyTitle")}
        emptyDescription={t("emptyDescription")}
        emptyAction={
          <Button
            variant="secondary"
            onClick={() => setParam({ q: null, role: null, rank: null, state: null })}
          >
            {t("clearFilters")}
          </Button>
        }
        footer={
          totalPages > 1 ? (
            <>
              <span className="whitespace-nowrap font-mono text-mono tabular-nums text-muted-foreground">
                {t("pageOf", { page, total: totalPages })}
              </span>
              <Pagination
                page={page}
                totalPages={totalPages}
                hrefFor={(target) => {
                  const next = new URLSearchParams(params.toString());
                  next.set("page", String(target));
                  return `${pathname}?${next.toString()}`;
                }}
              />
            </>
          ) : null
        }
      />

      {searchBy === "email" ? <EmailResults term={search} /> : null}
    </div>
  );
}

/** Emails live in Better Auth, not Convex, so this half of the search is a
 *  server action against Postgres. */
function EmailResults({ term }: { term: string }) {
  const t = useTranslations("admin.users.emailSearch");
  const actions = useTranslations("common.actions");
  const [rows, setRows] = useState<AccountRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const needle = term.trim();
    if (needle.length < 2) {
      setRows(null);
      setError(null);
      return;
    }
    const timer = window.setTimeout(() => {
      startTransition(async () => {
        const result = await searchAccountsAction(needle);
        if (result.ok) {
          setRows(result.data);
          setError(null);
        } else {
          setRows(null);
          setError(result.error);
        }
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [term]);

  if (term.trim().length < 2) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Mail className="size-3.5" aria-hidden />
        {t("prompt")}
      </p>
    );
  }
  if (error) return <StatusLine tone="bad">{error}</StatusLine>;
  if (rows === null) return <p className="text-sm text-muted-foreground">{pending ? t("searching") : ""}</p>;
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("none")}</p>;
  }

  return (
    <Table dense>
      <TableHeader>
        <TableRow>
          <TableHead>{t("columnUsername")}</TableHead>
          <TableHead>{t("columnEmail")}</TableHead>
          <TableHead>{t("columnAccount")}</TableHead>
          <TableHead>
            <span className="sr-only">{t("columnActions")}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.userId}>
            <TableCell className="font-medium">{row.username || DASH}</TableCell>
            <TableCell className="font-mono text-mono">{row.email}</TableCell>
            <TableCell>
              <Flags
                flags={[
                  { on: row.banned, label: t("flagBanned"), tone: "bad" },
                  { on: !row.emailVerified, label: t("flagUnverified"), tone: "warn" },
                  { on: row.twoFactorEnabled, label: t("flagTwoFactor"), tone: "good" },
                ]}
              />
            </TableCell>
            <TableCell>
              {row.username ? (
                <Button asChild variant="secondary" size="sm">
                  <Link href={`/admin/users/${row.username}/`}>{actions("edit")}</Link>
                </Button>
              ) : (
                DASH
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
