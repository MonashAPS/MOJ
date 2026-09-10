"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Badge, Button, cn, Panel, Progress } from "@moj/ui";
import { useQuery } from "convex/react";
import { useEffect, useState } from "react";

const NUMBER = new Intl.NumberFormat("en-AU");

export const JOB_TYPE_LABELS: Record<string, string> = {
  rejudge: "Rejudge",
  rescore: "Rescore",
  rescoreContest: "Rescore contest",
  rateContest: "Rate contest",
  rejudgeContestProblem: "Rejudge contest problem",
  moss: "MOSS",
  userExport: "Data export",
  pdf: "PDF",
  sitemap: "Sitemap",
};

export function jobTypeLabel(type: string): string {
  return JOB_TYPE_LABELS[type] ?? type;
}

export function JobStatusBadge({ status }: { status: string }) {
  const variant =
    status === "done" ? "good" : status === "failed" ? "bad" : status === "running" ? "run" : "neutral";
  const label =
    status === "done" ? "Done" : status === "failed" ? "Failed" : status === "running" ? "Running" : "Queued";
  return (
    <Badge variant={variant} shape="square">
      {label}
    </Badge>
  );
}

function elapsedText(from: number, to: number): string {
  const seconds = Math.max(0, Math.round((to - from) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/**
 * A Progress bar, a mono "412 / 1,308", an elapsed timer and a way out
 * (DESIGN 19.2). `jobs.status` is a subscription, so nothing polls.
 */
export function JobProgress({
  jobId,
  title = "Job",
  onDismiss,
  className,
}: {
  jobId: Id<"jobs"> | null;
  title?: string;
  onDismiss?: () => void;
  className?: string;
}) {
  const job = useQuery(api.jobs.status, jobId ? { jobId } : "skip");
  const [now, setNow] = useState(() => Date.now());

  const running = job?.status === "queued" || job?.status === "running";
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  if (!jobId) return null;
  if (job === undefined) {
    return (
      <Panel title={title} className={className} bodyClassName="p-3">
        <p className="text-sm text-muted-foreground">Starting…</p>
      </Panel>
    );
  }
  if (job === null) {
    return (
      <Panel title={title} className={className} bodyClassName="p-3">
        <p className="text-sm text-muted-foreground">That job is no longer on record.</p>
      </Panel>
    );
  }

  const total = job.progress?.total ?? 0;
  const done = job.progress?.done ?? 0;
  const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : job.status === "done" ? 100 : 0;
  const finishedAt = job.finishedAt ?? now;

  return (
    <Panel
      title={`${jobTypeLabel(job.type)} — ${title}`}
      action={<JobStatusBadge status={job.status} />}
      className={className}
      bodyClassName="grid gap-2 p-3"
    >
      <Progress
        value={percent}
        tone={job.status === "failed" ? "bad" : job.status === "done" ? "good" : "royal"}
      />
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-sm tabular-nums text-foreground">
          {NUMBER.format(done)} / {NUMBER.format(total)}
        </span>
        <span className="text-sm text-muted-foreground">{job.progress?.stage ?? ""}</span>
        <span className="ml-auto font-mono text-sm tabular-nums text-muted-foreground">
          {elapsedText(job.createdAt, finishedAt)}
        </span>
        {onDismiss ? (
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            {running ? "Hide" : "Dismiss"}
          </Button>
        ) : null}
      </div>
      {job.error ? (
        <p className={cn("text-sm text-danger-ink")}>{job.error}</p>
      ) : null}
    </Panel>
  );
}
