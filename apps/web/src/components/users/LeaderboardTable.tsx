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
  AlertDialogTrigger,
  Button,
  cn,
  EmptyRow,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  ratingClass,
  toast,
} from "@moj/ui";
import { useMutation } from "convex/react";
import { ChevronDown, ChevronUp, UserMinus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { sortHref, USER_SORTS, type UserSortKey, type UserSortState } from "./leaderboard";
import { UserLink } from "./UserLink";

export type LeaderboardRow = {
  _id: string;
  username: string;
  displayName: string;
  displayRank: string;
  points: number;
  performancePoints: number;
  problemCount: number;
  rating?: number;
  rank: number;
};

export type OrganizationChip = { slug: string; shortName: string; name: string; legacyId?: number };

const DASH = "—";

function organizationHref(chip: OrganizationChip) {
  return `/organization/${chip.legacyId ? `${chip.legacyId}-` : ""}${chip.slug}`;
}

/** DMOJ rounds performance points to a whole number and keeps two decimals in
 *  the cell's title. */
function whole(value: number) {
  return Math.round(value).toLocaleString("en-AU");
}

function SortableHead({
  column,
  state,
  basePath,
  params,
}: {
  column: { key: UserSortKey; label: string };
  state: UserSortState;
  basePath: string;
  params: string;
}) {
  const active = state.key === column.key;
  const search = new URLSearchParams(params);
  const Chevron = active && !state.descending ? ChevronUp : ChevronDown;
  return (
    <TableHead numeric className="p-0">
      <Link
        href={sortHref(basePath, search, column.key, state)}
        aria-sort={active ? (state.descending ? "descending" : "ascending") : undefined}
        className={cn(
          "flex h-8 w-full items-center justify-end gap-1 px-3 transition-colors hover:text-foreground",
          active && "text-foreground",
        )}
      >
        {column.label}
        <Chevron className={cn("size-3", active ? "text-primary" : "text-muted-foreground")} aria-hidden />
      </Link>
    </TableHead>
  );
}

function KickButton({ slug, username }: { slug: string; username: string }) {
  const kick = useMutation(api.organizations.kick);
  const [busy, setBusy] = useState(false);
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" icon={<UserMinus aria-hidden />}>
          Kick
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Kick {username}?</AlertDialogTitle>
          <AlertDialogDescription>
            They lose their place in this organization and every class inside it, and will have to join
            again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={async (event) => {
              event.preventDefault();
              setBusy(true);
              try {
                await kick({ slug, username });
                toast.success(`${username} is no longer a member.`);
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "That did not work.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Kicking\u2026" : "Kick"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * DMOJ's `user/base-users-table.html`, at ranking density: rank, username, then
 * the four sortable numeric columns. The viewer's own row is marked, and
 * `/users/find` lands on `#!username`, which highlights and scrolls to that row.
 */
export function LeaderboardTable({
  rows,
  state,
  basePath,
  params,
  viewerUsername,
  organizations,
  kickSlug,
  emptyMessage = "No users match this filter.",
}: {
  rows: LeaderboardRow[];
  state: UserSortState;
  basePath: string;
  params: string;
  viewerUsername?: string | null;
  organizations?: Record<string, OrganizationChip[]>;
  kickSlug?: string;
  emptyMessage?: string;
}) {
  const [targeted, setTargeted] = useState<string | null>(null);

  // `base-users.html`'s hashchange handler: `#!username` highlights that row and
  // scrolls it clear of the fixed chrome.
  useEffect(() => {
    const apply = () => {
      const hash = window.location.hash;
      if (!hash.startsWith("#!")) {
        setTargeted(null);
        return;
      }
      const username = decodeURIComponent(hash.slice(2));
      setTargeted(username);
      const row = document.getElementById(`user-${username}`);
      row?.scrollIntoView({ block: "center", behavior: "smooth" });
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);

  const columnCount = 6 + (kickSlug ? 1 : 0);

  return (
    <Table dense className="group/table">
      <TableHeader>
        <TableRow>
          <TableHead numeric className="w-16">
            Rank
          </TableHead>
          <TableHead>Username</TableHead>
          {kickSlug ? <TableHead className="w-24" /> : null}
          {USER_SORTS.map((column) => (
            <SortableHead
              key={column.key}
              column={column}
              state={state}
              basePath={basePath}
              params={params}
            />
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <EmptyRow colSpan={columnCount}>{emptyMessage}</EmptyRow>
        ) : (
          rows.map((row) => {
            const chips = organizations?.[row._id] ?? [];
            const isViewer = !!viewerUsername && viewerUsername === row.username;
            return (
              <TableRow
                key={row._id}
                id={`user-${row.username}`}
                selected={isViewer || targeted === row.username}
              >
                <TableCell numeric className={cn(row.rank <= 3 && "font-semibold text-foreground")}>
                  {row.rank}
                </TableCell>
                <TableCell className="max-w-[24rem]">
                  <span className="flex min-w-0 items-center gap-2">
                    <UserLink
                      username={row.username}
                      displayName={row.displayName}
                      rating={row.rating}
                      displayRank={row.displayRank}
                    />
                    {chips.map((chip) => (
                      <Link
                        key={chip.slug}
                        href={organizationHref(chip)}
                        title={chip.name}
                        className="shrink-0 rounded-sm border border-border bg-secondary px-1.5 font-mono text-xs leading-[18px] text-subtle hover:border-border-strong hover:text-foreground"
                      >
                        {chip.shortName}
                      </Link>
                    ))}
                  </span>
                </TableCell>
                {kickSlug ? (
                  <TableCell className="py-0">
                    <KickButton slug={kickSlug} username={row.username} />
                  </TableCell>
                ) : null}
                <TableCell numeric>{whole(row.points)}</TableCell>
                <TableCell numeric>{row.problemCount}</TableCell>
                <TableCell numeric title={row.performancePoints.toFixed(2)}>
                  {whole(row.performancePoints)}
                </TableCell>
                <TableCell numeric>
                  {row.rating === undefined ? (
                    <span className="text-muted-foreground">{DASH}</span>
                  ) : (
                    <span className={cn("rating", ratingClass(row.rating))}>{row.rating}</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}
