import { api } from "@convex/_generated/api";
import { Button, TitleRow } from "@moj/ui";
import Link from "next/link";
import { redirect } from "next/navigation";
import { queryAsViewer } from "@/lib/convex-server";
import { scopeFromParams, TicketsClient, ticketQueryArgs } from "./TicketsClient";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function generateMetadata({ searchParams }: Props) {
  const page = Number(one((await searchParams).page) ?? 1) || 1;
  return { title: page === 1 ? "Tickets" : `Tickets - Page ${page}` };
}

export default async function TicketsPage({ searchParams }: Props) {
  const params = await searchParams;
  const viewerState = await queryAsViewer(api.viewer.current, {}).catch(() => null);
  // `TicketList` is `LoginRequiredMixin` (judge/views/ticket.py:207).
  if (!viewerState?.profile) redirect("/accounts/login/?next=/tickets/");

  const scope = scopeFromParams(one(params.scope));
  const onlyOpen = one(params.open) === "1";
  const page = Math.max(1, Number(one(params.page) ?? 1) || 1);
  const args = ticketQueryArgs(scope, onlyOpen, page);
  const initial = await queryAsViewer(api.tickets.list, args).catch(() => ({
    page: [],
    isDone: true,
    continueCursor: "0",
    totalCount: 0,
  }));

  return (
    <>
      <TitleRow
        title="Tickets"
        action={
          <Button asChild>
            <Link href="/tickets/new/">New ticket</Link>
          </Button>
        }
      />
      <div id="content-body">
        <TicketsClient
          initial={initial}
          initialKey={JSON.stringify(args)}
          viewerProfileId={viewerState.profile._id}
        />
      </div>
    </>
  );
}
