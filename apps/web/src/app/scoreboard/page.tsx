import { api } from "@convex/_generated/api";
import {
  Badge,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TitleRow,
} from "@moj/ui";
import { MonitorPlay } from "lucide-react";
import Link from "next/link";
import { queryAsViewer } from "@/lib/convex-server";

export const metadata = { title: "Scoreboards" };

/** The index of hall scoreboards. The boards themselves are full-screen displays
 *  outside the site's chrome; this is the ordinary page that links to them. */
export default async function ScoreboardIndexPage() {
  const events = await queryAsViewer(api.scoreboard.events, {}).catch(() => []);

  return (
    <>
      <TitleRow title="Scoreboards" />
      <div id="content-body">
        {events.length === 0 ? (
          <EmptyState
            icon={<MonitorPlay aria-hidden />}
            title="No scoreboards"
            description="No hall scoreboard has been set up yet."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>Divisions</TableHead>
                <TableHead>Theme</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event) => (
                <TableRow key={event.key}>
                  <TableCell>
                    <Link className="font-medium text-link hover:underline" href={`/scoreboard/${event.key}`}>
                      {event.name}
                    </Link>
                    {event.isPublic ? null : (
                      <Badge className="ml-2" variant="neutral">
                        Private
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-mono text-subtle">
                    {event.contestKeys.join(", ")}
                  </TableCell>
                  <TableCell className="text-subtle">{event.theme}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </>
  );
}
