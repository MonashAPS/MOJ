"use client";

import { api } from "@convex/_generated/api";
import type { ContestDetail } from "@convex/contests";
import type { MossPayload } from "@convex/contests/tools";
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
import { useTranslations } from "next-intl";
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
  const t = useTranslations("contests.moss");
  const columns = useTranslations("contests.columns");
  const common = useTranslations("common.actions");
  const tabLabels = useTranslations("contests.tabs");
  const router = useRouter();
  const live = useQuery(api.contests.tools.moss, { key: contestKey });
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
      toast.success(t("deleted", { count: deleted }));
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("deleteFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <TitleRow
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {contest?.name ?? t("metaFallback")}
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
        tabs={contestTabs(detail, contestKey, viewerUsername, tabLabels)}
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
                <TableHead className="w-full">{columns("problem")}</TableHead>
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
                              {t("submissions", { count: cell.submissionCount })}
                            </a>
                          ) : (
                            <span>{t("submissions", { count: cell.submissionCount })}</span>
                          )
                        ) : (
                          <span className="text-muted-foreground">{t("noSubmissions")}</span>
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
            title={t("notConfiguredTitle")}
            description={t("notConfiguredBody")}
          />
        )}

        {byProblem.size > 0 ? (
          <div className="flex justify-end">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="danger" busy={busy}>
                  {t("deleteButton")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("deleteTitle", { name: contest?.name ?? "" })}</AlertDialogTitle>
                  <AlertDialogDescription>{t("deleteBody")}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{common("cancel")}</AlertDialogCancel>
                  <AlertDialogAction onClick={remove}>{t("deleteAction")}</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : null}
      </div>
    </>
  );
}
