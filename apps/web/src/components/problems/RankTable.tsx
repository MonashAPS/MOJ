"use client";

import { api } from "@convex/_generated/api";
import {
  EmptyState,
  Panel,
  RatingName,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  VerdictPill,
} from "@moj/ui";
import { useQuery } from "convex/react";
import { Trophy } from "lucide-react";
import Link from "next/link";
import { formatDate } from "@/lib/format";
import { formatMemory, formatPoints, formatTime } from "@/lib/units";

type Ranks = NonNullable<(typeof api.problems.ranks)["_returnType"]>;

export function RankTable({ code, initial }: { code: string; initial: Ranks }) {
  const live = useQuery(api.problems.ranks, { code });
  const data = live ?? initial;

  return (
    <div className="grid gap-6 min-[900px]:grid-cols-[1fr_17rem]">
      <div className="min-w-0">
        {data.rows.length === 0 ? (
          <EmptyState
            icon={<Trophy size={20} />}
            title="Nobody yet"
            description="No one has solved this problem yet."
          />
        ) : (
          <Table aria-label="Best submissions" dense>
            <TableHeader>
              <TableRow>
                <TableHead numeric className="w-12">
                  #
                </TableHead>
                <TableHead>User</TableHead>
                <TableHead numeric>Score</TableHead>
                <TableHead>Result</TableHead>
                <TableHead>Language</TableHead>
                <TableHead numeric>Time</TableHead>
                <TableHead numeric>Memory</TableHead>
                <TableHead numeric>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((row, index) => (
                <TableRow key={row.submissionId} className="group">
                  <TableCell numeric className="text-muted-foreground">
                    {index + 1}
                  </TableCell>
                  <TableCell className="relative">
                    <RatingName
                      username={row.username}
                      rating={row.rating}
                      href={`/user/${row.username}`}
                      isAdmin={row.displayRank === "admin"}
                    />
                  </TableCell>
                  <TableCell numeric>{formatPoints(row.points)}</TableCell>
                  <TableCell>{row.result ? <VerdictPill verdict={row.result} /> : "—"}</TableCell>
                  <TableCell className="font-mono text-sm text-subtle">
                    {row.language.shortName || row.language.name}
                  </TableCell>
                  <TableCell numeric>{formatTime(row.time)}</TableCell>
                  <TableCell numeric className="text-muted-foreground">
                    {formatMemory(row.memory)}
                  </TableCell>
                  <TableCell numeric className="text-muted-foreground">
                    <Link href={`/submission/${row.submissionId}`} className="hover:text-link">
                      {formatDate(row.date)}
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <aside>
        <div className="sticky top-[70px]">
          <Panel title="By language" bodyClassName="p-0">
            {data.byLanguage.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">No submissions yet.</p>
            ) : (
              <ul>
                {data.byLanguage.map((row) => (
                  <li
                    key={row.languageKey}
                    className="grid grid-cols-[1fr_auto] gap-x-3 border-b border-border px-3 py-2 last:border-b-0"
                  >
                    <span className="font-mono text-sm text-foreground">{row.languageKey}</span>
                    <span className="font-mono text-sm tabular-nums text-foreground">
                      {row.acRate.toFixed(0)}%
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {row.accepted.toLocaleString("en-AU")} / {row.total.toLocaleString("en-AU")} AC
                    </span>
                    <span className="text-right font-mono text-sm tabular-nums text-muted-foreground">
                      {formatTime(row.bestTime)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </aside>
    </div>
  );
}

export function RankTableSkeleton() {
  return <Skeleton className="h-64 w-full" />;
}
