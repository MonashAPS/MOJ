import { api } from "@convex/_generated/api";
import {
  Badge,
  Button,
  EmptyState,
  RatingName,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@moj/ui";
import { LifeBuoy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProblemPage } from "@/components/problems/ProblemHeader";
import { queryAsViewer } from "@/lib/convex-server";
import { formatRelative } from "@/lib/format";
import { viewerLanguage } from "@/lib/language.server";
import { plural } from "@/lib/units";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const problem = await queryAsViewer(api.problems.get, {
    code,
    language: await viewerLanguage(),
  }).catch(() => null);
  return { title: problem ? `Tickets for ${problem.statement.name}` : "No such problem" };
}

/**
 * DMOJ's `problem_ticket_list`: every ticket on this problem the viewer may see —
 * their own, unless they can edit the problem, in which case all of them.
 */
export default async function ProblemTicketsPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const problem = await queryAsViewer(api.problems.get, { code, language: await viewerLanguage() });
  if (!problem) notFound();

  const tickets = await queryAsViewer(api.tickets.list, {
    problemCode: problem.code,
    onlyOwn: !problem.canEdit,
  }).catch(() => null);
  const rows = tickets?.page ?? [];

  return (
    <ProblemPage problem={problem} active="tickets" title={`Tickets for ${problem.statement.name}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="font-mono text-sm tabular-nums text-muted-foreground">
          {plural(tickets?.totalCount ?? 0, "ticket")}
        </p>
        <Button asChild variant="secondary">
          <Link href={`/problem/${problem.code}/tickets/new`}>Report an issue</Link>
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<LifeBuoy size={20} />}
          title="No tickets"
          description={`Nobody has reported an issue with ${problem.statement.name}.`}
          action={
            <Button asChild variant="secondary">
              <Link href={`/problem/${problem.code}/tickets/new`}>Report an issue</Link>
            </Button>
          }
        />
      ) : (
        <Table aria-label="Tickets" dense>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">State</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Opened by</TableHead>
              <TableHead numeric>Messages</TableHead>
              <TableHead numeric>Last activity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((ticket) => (
              <TableRow key={ticket._id} className="group">
                <TableCell>
                  <Badge variant={ticket.isOpen ? "warn" : "neutral"}>
                    {ticket.isOpen ? "Open" : "Closed"}
                  </Badge>
                </TableCell>
                <TableCell className="relative">
                  <Link
                    href={ticket.href}
                    className="font-medium text-foreground after:absolute after:inset-0 group-hover:text-link"
                  >
                    {ticket.title}
                  </Link>
                </TableCell>
                <TableCell>
                  {ticket.author ? (
                    <RatingName
                      username={ticket.author.username}
                      rating={ticket.author.rating}
                      href={`/user/${ticket.author.username}`}
                      isAdmin={ticket.author.displayRank === "admin"}
                    />
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell numeric>{ticket.messageCount}</TableCell>
                <TableCell numeric className="text-muted-foreground">
                  {formatRelative(ticket.lastMessageTime)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </ProblemPage>
  );
}
