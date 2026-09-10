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
import { useCallback, useEffect, useState, useTransition } from "react";
import { type AdminColumn, AdminTable } from "@/components/admin/AdminTable";
import { formatDate } from "@/lib/format";
import { DASH, Flags, SearchBox, StatusLine } from "../_components/console";
import { type AccountRow, searchAccountsAction } from "./actions";

const PER_PAGE = 50;

const ROLE_OPTIONS = [
  { value: "any", label: "Anyone" },
  { value: "staff", label: "Staff" },
  { value: "superuser", label: "Superusers" },
  { value: "member", label: "Members" },
];

const RANK_OPTIONS = [
  { value: "any", label: "Any display rank" },
  { value: "user", label: "User" },
  { value: "setter", label: "Problem setter" },
  { value: "admin", label: "Admin" },
];

const STATE_OPTIONS = [
  { value: "any", label: "Any state" },
  { value: "unlisted", label: "Unlisted" },
  { value: "muted", label: "Muted" },
  { value: "deactivated", label: "Deactivated" },
];

const SEARCH_OPTIONS = [
  { value: "username", label: "Username" },
  { value: "email", label: "Email" },
];

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
      header: "Username",
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
      header: "Role",
      cell: (row) =>
        row.isSuperuser ? (
          <Badge variant="primary" shape="square">
            Superuser
          </Badge>
        ) : row.isStaff ? (
          <Badge variant="accent" shape="square">
            Staff
          </Badge>
        ) : (
          <span className="text-muted-foreground capitalize">{row.displayRank}</span>
        ),
    },
    { key: "points", header: "Points", numeric: true, cell: (row) => row.points.toFixed(0) },
    {
      key: "pp",
      header: "PP",
      numeric: true,
      cell: (row) => row.performancePoints.toFixed(0),
    },
    { key: "solved", header: "Solved", numeric: true, cell: (row) => row.problemCount },
    {
      key: "organizations",
      header: "Organizations",
      cell: (row) =>
        row.organizationSlugs.length === 0 ? (
          <span className="text-muted-foreground">{DASH}</span>
        ) : (
          <span className="font-mono text-mono text-subtle">{row.organizationSlugs.join(", ")}</span>
        ),
    },
    {
      key: "flags",
      header: "Flags",
      cell: (row) => (
        <Flags
          flags={[
            { on: row.isUnlisted, label: "Unlisted", tone: "warn" },
            { on: row.mute, label: "Muted", tone: "warn" },
            { on: !row.isActive, label: "Deactivated", tone: "bad" },
          ]}
        />
      ),
    },
    {
      key: "lastAccess",
      header: "Last seen",
      numeric: true,
      cell: (row) => (row.lastAccess ? formatDate(row.lastAccess) : DASH),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      cell: (row) => (
        <Button asChild variant="secondary" size="sm">
          <Link href={`/admin/users/${row.username}/`}>Edit</Link>
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
              options={SEARCH_OPTIONS}
              value={searchBy}
              onValueChange={(value) => setParam({ by: value === "username" ? null : value })}
              ariaLabel="Search by"
              size="sm"
              className="w-[124px]"
            />
            <SearchBox
              value={search}
              onChange={(value) => setParam({ q: value })}
              placeholder={searchBy === "email" ? "someone@example.com" : "Username"}
              ariaLabel={searchBy === "email" ? "Search users by email" : "Search users by username"}
            />
            <Select
              options={ROLE_OPTIONS}
              value={role}
              onValueChange={(value) => setParam({ role: value })}
              ariaLabel="Role"
              size="sm"
              className="w-[150px]"
            />
            <Select
              options={RANK_OPTIONS}
              value={rank}
              onValueChange={(value) => setParam({ rank: value })}
              ariaLabel="Display rank"
              size="sm"
              className="w-[176px]"
            />
            <Select
              options={STATE_OPTIONS}
              value={state}
              onValueChange={(value) => setParam({ state: value })}
              ariaLabel="Account state"
              size="sm"
              className="w-[150px]"
            />
            <span className="ml-auto font-mono text-mono tabular-nums text-muted-foreground">
              {result ? `${total.toLocaleString()} ${total === 1 ? "user" : "users"}` : ""}
            </span>
          </>
        }
        emptyTitle="No users match"
        emptyDescription="No account matches these filters. Widen the search or clear a filter."
        emptyAction={
          <Button
            variant="secondary"
            onClick={() => setParam({ q: null, role: null, rank: null, state: null })}
          >
            Clear filters
          </Button>
        }
        footer={
          totalPages > 1 ? (
            <>
              <span className="whitespace-nowrap font-mono text-mono tabular-nums text-muted-foreground">
                Page {page} of {totalPages}
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
        Type at least two characters of an email address.
      </p>
    );
  }
  if (error) return <StatusLine tone="bad">{error}</StatusLine>;
  if (rows === null) return <p className="text-sm text-muted-foreground">{pending ? "Searching…" : ""}</p>;
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No account has an email like that.</p>;
  }

  return (
    <Table dense>
      <TableHeader>
        <TableRow>
          <TableHead>Username</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Account</TableHead>
          <TableHead>
            <span className="sr-only">Actions</span>
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
                  { on: row.banned, label: "Banned", tone: "bad" },
                  { on: !row.emailVerified, label: "Unverified", tone: "warn" },
                  { on: row.twoFactorEnabled, label: "2FA", tone: "good" },
                ]}
              />
            </TableCell>
            <TableCell>
              {row.username ? (
                <Button asChild variant="secondary" size="sm">
                  <Link href={`/admin/users/${row.username}/`}>Edit</Link>
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
