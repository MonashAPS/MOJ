"use client";

import { api } from "@convex/_generated/api";
import type { ContestDetail, MossPayload } from "@convex/contests";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TitleRow,
  toast,
} from "@moj/ui";
import { useMutation, useQuery } from "convex/react";
import { Gavel } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { JoinControl } from "@/components/contests/JoinControls";
import { ContestChips } from "@/components/contests/pieces";
import { contestTabs, joinKindFor } from "../tabs";

/** `ContestMossView` (contests.py:852). MOSS needs an outbound call with a key
 *  the judge does not hold; without one the page says so and offers nothing. */
export function MossClient({
  contestKey,
  detail,
  moss,
  viewerUsername,
}: {
  contestKey: string;
  detail: ContestDetail;
  moss: MossPayload | null;
  viewerUsername: string | null;
}) {
  const router = useRouter();
  const live = useQuery(api.contests.moss, { key: contestKey });
  const data = live ?? moss;
  const deleteResults = useMutation(api.pages.contests.deleteMossResults);
  const [busy, setBusy] = useState(false);
  const contest = detail.contest;
  const joinKind = joinKindFor(detail);

  const results = data?.results ?? [];
  const languages = [...new Set(results.map((row) => row.languageKey))].sort();
  const byProblem = new Map<string, { name: string; cells: Map<string, (typeof results)[number]> }>();
  for (const row of results) {
    const entry = byProblem.get(row.problemCode) ?? { name: row.problemName, cells: new Map() };
    entry.cells.set(row.languageKey, row);
    byProblem.set(row.problemCode, entry);
  }

  const remove = async () => {
    setBusy(true);
    try {
      const { deleted } = await deleteResults({ key: contestKey });
      toast.success(deleted === 1 ? "1 MOSS result deleted" : `${deleted} MOSS results deleted`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The results could not be deleted.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <TitleRow
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {contest?.name ?? "MOSS"}
            {contest ? (
              <ContestChips
                isVisible={contest.isVisible}
                isPrivate={contest.isPrivate}
                isOrganizationPrivate={contest.isOrganizationPrivate}
                isRated={contest.isRated}
                organizations={contest.organizations}
                tags={contest.tags}
              />
            ) : null}
          </span>
        }
        tabs={contestTabs(detail, contestKey, viewerUsername)}
        active="moss"
        action={
          joinKind ? <JoinControl contestKey={contestKey} kind={joinKind} long size="default" /> : undefined
        }
      />

      <div className="grid gap-6">
        {byProblem.size > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-full">Problem</TableHead>
                {languages.map((language) => (
                  <TableHead key={language}>{language}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...byProblem.entries()].map(([code, entry]) => (
                <TableRow key={code}>
                  <TableCell>
                    <Link href={`/problem/${code}/`}>{entry.name}</Link>
                  </TableCell>
                  {languages.map((language) => {
                    const cell = entry.cells.get(language);
                    return (
                      <TableCell key={language} className="whitespace-nowrap">
                        {cell?.submissionCount ? (
                          cell.url ? (
                            <a href={cell.url} rel="noreferrer nofollow" target="_blank">
                              {cell.submissionCount === 1
                                ? "1 submission"
                                : `${cell.submissionCount} submissions`}
                            </a>
                          ) : (
                            <span>
                              {cell.submissionCount === 1
                                ? "1 submission"
                                : `${cell.submissionCount} submissions`}
                            </span>
                          )
                        ) : (
                          <span className="text-muted-foreground">No submissions</span>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState
            icon={<Gavel aria-hidden />}
            title="MOSS is not configured"
            description="This judge has no MOSS API key, so contest submissions cannot be sent for plagiarism analysis."
          />
        )}

        {byProblem.size > 0 ? (
          <div className="flex justify-end">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="danger" busy={busy}>
                  Delete MOSS results
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{`Delete the MOSS results for ${contest?.name}?`}</AlertDialogTitle>
                  <AlertDialogDescription>
                    The reports stay on MOSS's own servers; the links from this page go for good.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={remove}>Delete results</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : null}
      </div>
    </>
  );
}
