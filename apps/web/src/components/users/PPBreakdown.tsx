"use client";

import { api } from "@convex/_generated/api";
import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, VerdictPill } from "@moj/ui";
import { useQuery } from "convex/react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { formatDateTime, formatRelative } from "@/lib/format";

export type PPEntry = {
  points: number;
  weight: number;
  scaledPoints: number;
  problemName: string;
  problemCode: string;
  submissionId: string;
  submissionDate: number;
  submissionPoints: number;
  submissionTotal: number;
  shortStatus: string;
  longStatus: string;
  language: string;
};

/** `UserProblemsPage` asks for ten weights, then `user_pp_ajax` ten at a time. */
const PAGE = 10;

function round(value: number, places = 0) {
  return value.toLocaleString("en-AU", { minimumFractionDigits: places, maximumFractionDigits: places });
}

/** `user/pp-table-body.html`: every problem the user scored on, weighted down the
 *  `PP_TABLE` curve, with DMOJ's "Load more" behind it. */
export function PPBreakdown({
  username,
  initial,
  initialHasMore,
}: {
  username: string;
  initial: PPEntry[];
  initialHasMore: boolean;
}) {
  const t = useTranslations("users.pp");
  const states = useTranslations("common.states");
  const [shown, setShown] = useState(PAGE);

  // The window always starts at zero, so one subscription holds every row that
  // has been asked for and nothing has to be stitched together on the client.
  const more = useQuery(
    api.profiles.performancePoints,
    shown > PAGE ? { username, start: 0, end: shown } : "skip",
  );

  const entries: PPEntry[] = more?.entries ?? initial;
  const hasMore = more ? more.hasMore : initialHasMore;
  const loading = shown > PAGE && more === undefined;

  if (entries.length === 0) return null;

  return (
    <section>
      <h3 className="mb-2 font-display text-h3 font-semibold text-foreground">{t("title")}</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("problem")}</TableHead>
            <TableHead>{t("result")}</TableHead>
            <TableHead numeric>{t("score")}</TableHead>
            <TableHead numeric>{t("points")}</TableHead>
            <TableHead numeric>{t("weight")}</TableHead>
            <TableHead numeric>{t("weighted")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => (
            <TableRow key={entry.submissionId}>
              <TableCell>
                <Link href={`/problem/${entry.problemCode}/`} className="font-medium hover:text-link">
                  {entry.problemName}
                </Link>
                <span
                  className="ml-2 font-mono text-sm text-muted-foreground"
                  title={formatDateTime(entry.submissionDate)}
                >
                  {formatRelative(entry.submissionDate)}
                </span>
              </TableCell>
              <TableCell className="whitespace-nowrap">
                <span className="flex items-center gap-2">
                  <VerdictPill verdict={entry.shortStatus} label={entry.shortStatus} />
                  <span className="font-mono text-xs uppercase text-muted-foreground">{entry.language}</span>
                </span>
              </TableCell>
              <TableCell numeric>
                {round(entry.submissionPoints)}
                <span className="text-muted-foreground"> / {round(entry.submissionTotal)}</span>
              </TableCell>
              <TableCell numeric>
                <Link href={`/submission/${entry.submissionId}/`} className="hover:text-link">
                  {round(entry.points)}
                  <span className="text-muted-foreground">pp</span>
                </Link>
              </TableCell>
              <TableCell numeric className="text-subtle">
                {round(entry.weight)}%
              </TableCell>
              <TableCell numeric>{round(entry.scaledPoints, entry.scaledPoints < 10 ? 1 : 0)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {hasMore ? (
        <div className="mt-3 flex justify-center">
          <Button
            variant="secondary"
            size="sm"
            disabled={loading}
            onClick={() => setShown((value) => value + PAGE)}
          >
            {loading ? states("loading") : t("loadMore")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
