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
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { queryAsViewer } from "@/lib/convex-server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("contests.scoreboards");

  return { title: t("title") };
}

/** The index of hall scoreboards. The boards themselves are full-screen displays
 *  outside the site's chrome; this is the ordinary page that links to them. */
export default async function ScoreboardIndexPage() {
  const t = await getTranslations("contests.scoreboards");
  const columns = await getTranslations("contests.columns");
  const events = await queryAsViewer(api.scoreboard.events, {}).catch(() => []);

  return (
    <>
      <TitleRow title={t("title")} />
      <div id="content-body">
        {events.length === 0 ? (
          <EmptyState
            icon={<MonitorPlay aria-hidden />}
            title={t("emptyTitle")}
            description={t("emptyBody")}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{columns("event")}</TableHead>
                <TableHead>{columns("divisions")}</TableHead>
                <TableHead>{columns("theme")}</TableHead>
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
                        {t("private")}
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
