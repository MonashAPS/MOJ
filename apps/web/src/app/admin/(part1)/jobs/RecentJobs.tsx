"use client";

import { api } from "@convex/_generated/api";
import { EmptyState, Panel, Progress } from "@moj/ui";
import { useQuery } from "convex/react";
import { LayoutList } from "lucide-react";
import Link from "next/link";
import { JobStatusBadge, jobTypeLabel } from "@/components/admin";
import { formatRelative } from "@/lib/format";

/** The overview's tail: what the console has been asked to do lately. */
export function RecentJobs({ limit = 5 }: { limit?: number }) {
  const jobs = useQuery(api.jobs.recent, { limit });

  return (
    <Panel
      title="Recent jobs"
      action={
        <Link
          href="/admin/jobs/"
          className="text-sm text-titlebar-ink hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-royal/45"
        >
          All jobs
        </Link>
      }
      bodyClassName="p-0"
    >
      {jobs === undefined ? (
        <p className="p-3 text-sm text-muted-foreground">Loading…</p>
      ) : jobs.length === 0 ? (
        <EmptyState
          className="m-3"
          icon={<LayoutList aria-hidden />}
          title="No jobs yet"
          description="Rejudges, rescores and ratings appear here while they run."
        />
      ) : (
        <ul className="divide-y divide-border">
          {jobs.map((job) => {
            const total = job.progress?.total ?? 0;
            const done = job.progress?.done ?? 0;
            return (
              <li key={job._id} className="grid gap-1 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-medium text-foreground">{jobTypeLabel(job.type)}</span>
                  <JobStatusBadge status={job.status} />
                  <span className="ml-auto font-mono text-sm tabular-nums text-muted-foreground">
                    {formatRelative(job.createdAt)}
                  </span>
                </div>
                <Progress
                  value={total > 0 ? Math.round((done / total) * 100) : job.status === "done" ? 100 : 0}
                  tone={job.status === "failed" ? "bad" : job.status === "done" ? "good" : "royal"}
                />
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
