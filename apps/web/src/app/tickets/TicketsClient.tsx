"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  Checkbox,
  cn,
  EmptyRow,
  Pagination,
  RatingName,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  ToggleGroup,
  ToggleGroupItem,
  Tooltip,
} from "@moj/ui";
import { useQuery } from "convex/react";
import { CircleAlert, CircleCheck } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { formatDateTime, formatRelative } from "@/lib/format";
import { PER_PAGE, scopeFromParams, type TicketPage, type TicketSummary, ticketQueryArgs } from "./filters";

export function TicketsClient({
  initial,
  initialKey,
  viewerProfileId,
  problemCode,
}: {
  initial: TicketPage;
  initialKey: string;
  viewerProfileId: Id<"profiles"> | null;
  problemCode?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const scope = scopeFromParams(params.get("scope") ?? undefined);
  const onlyOpen = params.get("open") === "1";
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);

  const args = useMemo(
    () => ticketQueryArgs(scope, onlyOpen, page, problemCode),
    [scope, onlyOpen, page, problemCode],
  );
  const live = useQuery(api.tickets.list, args);
  const key = JSON.stringify(args);
  const result = live ?? (key === initialKey ? initial : undefined);

  function setParam(next: Record<string, string | null>) {
    const query = new URLSearchParams(params.toString());
    for (const [name, value] of Object.entries(next)) {
      if (value === null) query.delete(name);
      else query.set(name, value);
    }
    if (!("page" in next)) query.delete("page");
    const search = query.toString();
    router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
  }

  const narrowed =
    result && scope === "assigned" && viewerProfileId
      ? result.page.filter((ticket) => ticket.assignees.some((one) => one._id === viewerProfileId))
      : (result?.page ?? []);

  const total = scope === "assigned" ? narrowed.length : (result?.totalCount ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const rows = scope === "assigned" ? narrowed.slice((page - 1) * PER_PAGE, page * PER_PAGE) : narrowed;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <ToggleGroup
          type="single"
          value={scope}
          onValueChange={(next) => next && setParam({ scope: next === "all" ? null : next })}
          className="w-auto shrink-0"
          aria-label="Which tickets"
        >
          <ToggleGroupItem value="all" className="flex-none px-3">
            All
          </ToggleGroupItem>
          <ToggleGroupItem value="mine" className="flex-none px-3">
            Mine
          </ToggleGroupItem>
          <ToggleGroupItem value="assigned" className="flex-none px-3">
            Assigned to me
          </ToggleGroupItem>
        </ToggleGroup>

        <Checkbox
          checked={onlyOpen}
          onCheckedChange={(checked) => setParam({ open: checked ? "1" : null })}
          label="Hide closed tickets"
        />

        <span className="ml-auto font-mono text-sm tabular-nums text-muted-foreground">
          {result === undefined ? "" : `${total} ${total === 1 ? "ticket" : "tickets"}`}
        </span>
      </div>

      {result === undefined ? (
        <TicketsSkeleton />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                <span className="sr-only">Status</span>
              </TableHead>
              <TableHead numeric className="w-16">
                ID
              </TableHead>
              <TableHead>Title</TableHead>
              <TableHead className="w-40">User</TableHead>
              <TableHead className="w-56">Assignees</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={5}>{emptyMessage(scope, onlyOpen, Boolean(problemCode))}</EmptyRow>
            ) : (
              rows.map((ticket) => <TicketRow key={ticket._id} ticket={ticket} />)
            )}
          </TableBody>
        </Table>
      )}

      {totalPages > 1 ? (
        <Pagination
          page={page}
          totalPages={totalPages}
          hrefFor={(target) => {
            const query = new URLSearchParams(params.toString());
            if (target === 1) query.delete("page");
            else query.set("page", String(target));
            const search = query.toString();
            return search ? `${pathname}?${search}` : pathname;
          }}
        />
      ) : null}
    </div>
  );
}

/** Empty states name what would fill the space, per DESIGN.md section 20.1. */
function emptyMessage(scope: string, onlyOpen: boolean, onProblem: boolean): string {
  if (scope === "assigned") {
    return onlyOpen ? "Nothing open is assigned to you." : "Nothing is assigned to you.";
  }
  if (scope === "mine") {
    return onlyOpen
      ? "None of your tickets are open."
      : "You have not filed a ticket, and none are assigned to you.";
  }
  if (onlyOpen) return "No open tickets.";
  return onProblem ? "Nobody has reported an issue with this problem." : "No tickets have been filed yet.";
}

function TicketRow({ ticket }: { ticket: TicketSummary }) {
  const state = ticket.isOpen ? "Open" : "Closed";
  return (
    <TableRow>
      <TableCell className="pr-0">
        <Tooltip content={state}>
          <span className="flex items-center">
            {ticket.isOpen ? (
              <CircleAlert className="size-4 text-warn" aria-label={state} />
            ) : (
              <CircleCheck className="size-4 text-good" aria-label={state} />
            )}
          </span>
        </Tooltip>
      </TableCell>
      <TableCell numeric className="text-muted-foreground">
        {ticket.legacyId ?? "—"}
      </TableCell>
      <TableCell>
        <Link href={`${ticket.href}/`} className="font-medium text-link">
          {ticket.title}
        </Link>
        <div className="text-sm text-muted-foreground">
          {ticket.linkedTitle ? (
            <>
              <span>{ticket.linkedTitle}</span>
              {" · "}
            </>
          ) : null}
          <time dateTime={new Date(ticket.time).toISOString()} title={formatDateTime(ticket.time)}>
            {formatRelative(ticket.time)}
          </time>
        </div>
      </TableCell>
      <TableCell>
        {ticket.author ? (
          <RatingName
            username={ticket.author.username}
            displayName={ticket.author.displayName}
            rating={ticket.author.rating}
            href={`/user/${ticket.author.username}/`}
            isAdmin={ticket.author.displayRank === "admin"}
          />
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className={cn("text-sm", ticket.assignees.length === 0 && "text-muted-foreground")}>
        {ticket.assignees.length === 0
          ? "No one is assigned."
          : ticket.assignees.map((one, index) => (
              <span key={one._id}>
                {index > 0 ? ", " : ""}
                <RatingName
                  username={one.username}
                  displayName={one.displayName}
                  rating={one.rating}
                  href={`/user/${one.username}/`}
                  isAdmin={one.displayRank === "admin"}
                />
              </span>
            ))}
      </TableCell>
    </TableRow>
  );
}

function TicketsSkeleton() {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-card">
      <div className="h-8 bg-titlebar" />
      {Array.from({ length: 8 }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: placeholder rows have no identity
        <div key={index} className="flex h-(--row-h) items-center gap-3 border-b border-border px-3">
          <Skeleton className="size-4 rounded-full" />
          <Skeleton className="h-3 w-8" />
          <Skeleton className="h-3 flex-1" />
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-3 w-40" />
        </div>
      ))}
    </div>
  );
}
