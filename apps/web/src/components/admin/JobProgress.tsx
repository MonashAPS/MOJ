"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Button, Panel, Progress } from "@moj/ui";
import { useQuery } from "convex/react";
import { useEffect, useState } from "react";

function elapsed(from: number, to: number): string {
  const seconds = Math.max(0, Math.round((to - from) / 1000));
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes}m ${String(seconds % 60).padStart(2, "0")}s` : `${seconds}s`;
}

/**
 * A running job: a progress bar, the mono counter, an elapsed timer and a way
 * out. The submission page uses the same component. Part 1 owns the canonical
 * version of this file.
 */
export function JobProgress({
  jobId,
  onDismiss,
}: {
  jobId: Id<"jobs">;
  onDismiss?: () => void;
}) {
  const job = useQuery(api.jobs.status, { jobId });
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!job || job.status === "done" || job.status === "failed") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [job]);

  if (!job) return null;

  const { done, total, stage } = job.progress;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const finished = job.status === "done" || job.status === "failed";

  return (
    <Panel
      title={job.type}
      action={
        onDismiss ? (
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            {finished ? "Dismiss" : "Hide"}
          </Button>
        ) : null
      }
      bodyClassName="grid gap-2 p-3"
    >
      <Progress value={pct} tone={job.status === "failed" ? "bad" : "royal"} />
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">{job.error ?? stage}</span>
        <span className="font-mono text-mono tabular-nums text-subtle">
          {done.toLocaleString()} / {total.toLocaleString()} ·{" "}
          {elapsed(job.createdAt, job.finishedAt ?? now)}
        </span>
      </div>
    </Panel>
  );
}
