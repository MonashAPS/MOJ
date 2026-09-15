"use client";

import { api } from "@convex/_generated/api";
import type { StatusPage } from "@convex/status";
import { useQuery } from "convex/react";
import { JudgeTable } from "@/components/status/JudgeTable";
import { StatusSkeleton } from "./StatusSkeleton";

/** `status/judge-status-table.html`, live: a judge's ping and load move while the
 *  page is open, so the table is a subscription rather than DMOJ's 5s poll. */
export function StatusTable({ initial }: { initial: StatusPage }) {
  const live = useQuery(api.status.table, {});

  if (live === undefined && initial.judges.length === 0) return <StatusSkeleton />;

  return (
    <JudgeTable judges={live?.judges ?? initial.judges} seeAll={live?.seeAllJudges ?? initial.seeAllJudges} />
  );
}
