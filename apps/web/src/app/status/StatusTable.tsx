"use client";

import { api } from "@convex/_generated/api";
import type { StatusPage } from "@convex/status";
import {
  Badge,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
} from "@moj/ui";
import { useQuery } from "convex/react";
import { ServerOff } from "lucide-react";
import { DASH } from "@/lib/submissionFormat";
import { StatusSkeleton } from "./StatusSkeleton";

/** `judge.uptime|timedelta('localized')`, compact. */
function formatUptime(ms: number | null): string {
  if (ms === null || ms <= 0) return DASH;
  const seconds = Math.floor(ms / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** `status/judge-status-table.html`, live: a judge's ping and load move while the
 *  page is open, so the table is a subscription rather than DMOJ's 5s poll. */
export function StatusTable({ initial }: { initial: StatusPage }) {
  const live = useQuery(api.status.table, {});
  const judges = live?.judges ?? initial.judges;
  const seeAll = live?.seeAllJudges ?? initial.seeAllJudges;

  if (live === undefined && initial.judges.length === 0) return <StatusSkeleton />;

  if (judges.length === 0) {
    return (
      <EmptyState icon={<ServerOff aria-hidden />} title="No judges" description="No judges are online." />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Judge</TableHead>
          {seeAll ? <TableHead>Status</TableHead> : null}
          <TableHead numeric>Uptime</TableHead>
          <TableHead numeric>Ping</TableHead>
          <TableHead numeric>Load</TableHead>
          <TableHead numeric>Tier</TableHead>
          <TableHead>Runtimes</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {judges.map((judge) => (
          <TableRow key={judge.name}>
            <TableCell className="whitespace-nowrap font-mono text-mono font-medium text-foreground">
              {judge.name}
            </TableCell>
            {seeAll ? (
              <TableCell className="whitespace-nowrap">
                <Badge variant={judge.online ? "good" : "neutral"}>
                  {judge.online ? "Online" : "Offline"}
                </Badge>
              </TableCell>
            ) : null}
            <TableCell numeric>{judge.online ? formatUptime(judge.uptime) : DASH}</TableCell>
            <TableCell numeric>
              {judge.online && judge.pingMs !== null ? (
                <>
                  {judge.pingMs.toFixed(3)}
                  <span className="text-muted-foreground"> ms</span>
                </>
              ) : (
                DASH
              )}
            </TableCell>
            <TableCell numeric>
              {judge.online && judge.load !== null ? judge.load.toFixed(3) : DASH}
            </TableCell>
            <TableCell numeric>{judge.tier}</TableCell>
            <TableCell className="font-mono text-mono text-subtle">
              {judge.runtimes.length === 0 ? (
                DASH
              ) : (
                <span className="flex flex-wrap gap-x-2 gap-y-1">
                  {judge.runtimes.map((runtime) => (
                    <Tooltip
                      key={runtime.key}
                      content={runtime.runtimes
                        .map((entry) => `${entry.name} ${entry.version}`.trim())
                        .join(", ")}
                    >
                      <span className="cursor-help underline decoration-dotted underline-offset-2">
                        {runtime.name}
                      </span>
                    </Tooltip>
                  ))}
                </span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
