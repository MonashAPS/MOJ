"use client";

import { Badge, EmptyState, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@moj/ui";
import { ServerOff } from "lucide-react";
import { StatusSkeleton } from "./StatusSkeleton";

/** One row of DMOJ's `/status/` table. The judging agent's Convex query fills these
 *  from the `judges` table (`name`, `online`, `ping`, `load`, `runtimeKeys`). */
export type JudgeRow = {
  name: string;
  online: boolean;
  ping?: number;
  load?: number;
  runtimes: string[];
};

/** A missing value is an em-dash, never `---`. */
const DASH = "—";

/** `null` means "still loading" and draws the list's own shape; `[]` is the honest
 *  "there are no judges" state. There is no judges query in `convex/` yet, so the
 *  default is the empty list — swap it for `useQuery(...) ?? null` when one lands. */
export function StatusTable({ judges = [] }: { judges?: JudgeRow[] | null }) {
  if (judges === null) return <StatusSkeleton />;

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
          <TableHead>Status</TableHead>
          <TableHead numeric>Ping</TableHead>
          <TableHead numeric>Load</TableHead>
          <TableHead>Runtimes</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {judges.map((judge) => (
          <TableRow key={judge.name}>
            <TableCell className="whitespace-nowrap font-mono text-mono font-medium text-foreground">
              {judge.name}
            </TableCell>
            <TableCell className="whitespace-nowrap">
              <Badge variant={judge.online ? "good" : "neutral"}>{judge.online ? "Online" : "Offline"}</Badge>
            </TableCell>
            <TableCell numeric>
              {judge.ping === undefined ? (
                DASH
              ) : (
                <>
                  {judge.ping.toFixed(1)}
                  <span className="text-muted-foreground"> ms</span>
                </>
              )}
            </TableCell>
            <TableCell numeric>{judge.load === undefined ? DASH : judge.load.toFixed(2)}</TableCell>
            <TableCell className="font-mono text-mono text-subtle">
              {judge.runtimes.length === 0 ? DASH : judge.runtimes.join(", ")}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
