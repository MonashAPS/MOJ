"use client";

import { api } from "@convex/_generated/api";
import { Badge, EmptyState, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@moj/ui";
import { useQuery } from "convex/react";
import { MonitorOff } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AdminShell } from "@/components/admin";
import { formatDateTime } from "@/lib/format";

/**
 * Who is sharing, right now.
 *
 * Convex pushes, so this is live without anything of its own: a session that
 * stops heartbeating stops being live here within the window, which is what
 * makes a competitor closing the tab visible rather than silent.
 */
export function ProctorSessions() {
  const t = useTranslations("admin.proctor");
  const states = useTranslations("common.states");
  const sessions = useQuery(api.proctor.sessions, {});

  const breadcrumb = [{ label: t("breadcrumbConsole"), href: "/admin/" }, { label: t("title") }];

  return (
    <AdminShell title={t("title")} breadcrumb={breadcrumb}>
      {sessions === undefined ? (
        <p className="text-sm text-muted-foreground">{states("loading")}</p>
      ) : sessions.length === 0 ? (
        <EmptyState icon={<MonitorOff aria-hidden />} title={t("emptyTitle")} description={t("emptyBody")} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("user")}</TableHead>
              <TableHead>{t("contest")}</TableHead>
              <TableHead>{t("started")}</TableHead>
              <TableHead>{t("lastSeen")}</TableHead>
              <TableHead>{t("recording")}</TableHead>
              <TableHead>{t("status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map((session) => (
              <TableRow key={session._id}>
                <TableCell>
                  <Link href={`/admin/proctor/${session._id}/`}>{session.displayName}</Link>
                </TableCell>
                <TableCell>
                  {session.contestKey ? (
                    <Link href={`/contest/${session.contestKey}/`}>{session.contestKey}</Link>
                  ) : (
                    <span className="text-muted-foreground">{t("noContest")}</span>
                  )}
                </TableCell>
                <TableCell className="tabular-nums">{formatDateTime(session.startedAt)}</TableCell>
                <TableCell className="tabular-nums">{formatDateTime(session.lastSeenAt)}</TableCell>
                <TableCell className="tabular-nums">{t("slices", { count: session.chunkCount })}</TableCell>
                <TableCell>
                  {session.live ? (
                    <Badge variant="good" shape="square">
                      {t("live")}
                    </Badge>
                  ) : (
                    <Badge variant="neutral" shape="square">
                      {session.endedReason ?? t("lapsed")}
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </AdminShell>
  );
}
