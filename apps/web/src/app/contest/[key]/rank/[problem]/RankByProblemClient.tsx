"use client";

import { api } from "@convex/_generated/api";
import type { RankByProblemPayload } from "@convex/contestRankings";
import type { ContestDetail } from "@convex/contests";
import {
  EmptyState,
  MicroLabel,
  MultiSelect,
  RatingName,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TitleRow,
  VerdictPill,
} from "@moj/ui";
import { useQuery } from "convex/react";
import { Trophy } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { JoinControl } from "@/components/contests/JoinControls";
import { formatDateTime, formatPoints } from "@/lib/format";
import { contestTabs, joinKindFor } from "../../tabs";

const DASH = "—";

/** `ContestRankedSubmission` (judge/views/ranked_submission.py:80): each user's
 *  best contest submission for one problem, best first, then fastest. */
export function RankByProblemClient({
  contestKey,
  problemCode,
  detail,
  initial,
  viewerUsername,
}: {
  contestKey: string;
  problemCode: string;
  detail: ContestDetail;
  initial: RankByProblemPayload;
  viewerUsername: string | null;
}) {
  const [languageKeys, setLanguageKeys] = useState<string[]>([]);
  const live = useQuery(api.contestRankings.rankByProblem, {
    key: contestKey,
    problemCode,
    ...(languageKeys.length > 0 ? { languageKeys } : {}),
  });
  const data = live ?? (languageKeys.length === 0 ? initial : null);
  const joinKind = joinKindFor(detail);
  const precision = detail.contest?.pointsPrecision ?? 2;

  const languageOptions = [
    ...new Map((initial?.rows ?? []).map((row) => [row.languageKey, row.languageName] as const)).entries(),
  ]
    .filter(([key]) => key)
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return (
    <>
      <TitleRow
        breadcrumb={<Link href={`/contest/${contestKey}/`}>{detail.contest?.name ?? contestKey}</Link>}
        title={data ? `${data.label}. ${data.problemName}` : `Best solutions for ${problemCode}`}
        tabs={contestTabs(detail, contestKey, viewerUsername)}
        active="ranking"
        action={
          joinKind ? <JoinControl contestKey={contestKey} kind={joinKind} long size="default" /> : undefined
        }
      />

      {data === null ? (
        <EmptyState
          icon={<Trophy aria-hidden />}
          title="Not available"
          description="The best solutions for this problem are only listed once the full scoreboard is visible to you."
        />
      ) : data === undefined ? null : (
        <div className="grid gap-4">
          {languageOptions.length > 1 ? (
            <div className="grid max-w-[320px] gap-1">
              <MicroLabel>Languages</MicroLabel>
              <MultiSelect
                options={languageOptions}
                values={languageKeys}
                onChange={setLanguageKeys}
                searchPlaceholder="Filter languages…"
                emptyText="No languages."
              />
            </div>
          ) : null}

          {data.rows.length === 0 ? (
            <EmptyState
              icon={<Trophy aria-hidden />}
              title="No solutions"
              description={`Nobody scored on ${data.problemName} during this contest.`}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead numeric className="w-12">
                    #
                  </TableHead>
                  <TableHead className="w-full">User</TableHead>
                  <TableHead numeric>Score</TableHead>
                  <TableHead>Verdict</TableHead>
                  <TableHead>Language</TableHead>
                  <TableHead numeric>Time</TableHead>
                  <TableHead numeric>Memory</TableHead>
                  <TableHead numeric>Submitted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((row, index) => (
                  <TableRow key={row.submissionId} selected={row.user.username === viewerUsername}>
                    <TableCell numeric className="text-muted-foreground">
                      {index + 1}
                    </TableCell>
                    <TableCell>
                      <RatingName
                        username={row.user.username}
                        displayName={row.user.displayName}
                        rating={row.user.rating}
                        href={`/user/${row.user.username}/`}
                        isAdmin={row.user.displayRank === "admin"}
                      />
                    </TableCell>
                    <TableCell numeric>{formatPoints(row.points, precision)}</TableCell>
                    <TableCell>
                      {row.result ? <VerdictPill verdict={row.result} /> : <span>{DASH}</span>}
                    </TableCell>
                    <TableCell className="font-mono text-xs uppercase text-muted-foreground">
                      {row.languageName}
                    </TableCell>
                    <TableCell numeric>{row.time === null ? DASH : `${row.time.toFixed(2)}s`}</TableCell>
                    <TableCell numeric className="text-muted-foreground">
                      {row.memory === null ? DASH : `${(row.memory / 1024).toFixed(1)} MB`}
                    </TableCell>
                    <TableCell numeric className="text-muted-foreground">
                      <Link href={`/submission/${row.submissionId}/`} className="relative z-1">
                        {formatDateTime(row.date)}
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}
    </>
  );
}
