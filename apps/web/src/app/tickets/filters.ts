/** The ticket list's URL state, shared by the server page and its client. Neither
 *  directive belongs here: a `"use client"` module cannot be called on the server. */

import type { api } from "@convex/_generated/api";
import type { FunctionReturnType } from "convex/server";

export type TicketPage = FunctionReturnType<typeof api.tickets.list>;

export type TicketSummary = TicketPage["page"][number];

export type TicketScope = "all" | "mine" | "assigned";

/** `TicketList.paginate_by` (judge/views/ticket.py:212). */
export const PER_PAGE = 50;

/** `filter_visible_tickets` already narrows the table to what the viewer may see,
 *  and collects the whole table to do it, so asking for a wide page costs the
 *  backend nothing extra when the assignee narrowing has to happen here. */
const WIDE_PAGE = 200;

export function scopeFromParams(value: string | undefined): TicketScope {
  return value === "mine" || value === "assigned" ? value : "all";
}

export function ticketQueryArgs(scope: TicketScope, onlyOpen: boolean, page: number, problemCode?: string) {
  const wide = scope === "assigned";

  return {
    paginationOpts: {
      numItems: wide ? WIDE_PAGE : PER_PAGE,
      cursor: wide ? "0" : String((page - 1) * PER_PAGE),
    },
    onlyOpen: onlyOpen || undefined,
    onlyOwn: scope !== "all" || undefined,
    problemCode,
  };
}
