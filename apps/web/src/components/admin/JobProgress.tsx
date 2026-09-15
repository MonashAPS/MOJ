"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Badge, Button, cn, Panel, Progress } from "@moj/ui";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

const NUMBER = new Intl.NumberFormat("en-AU");

/** English names for the job types, for the callers that render one outside a
 *  component of their own. `JobProgress` reads the same names from the
 *  catalogue instead. */
export function JobStatusBadge({ status }: { status: string }) {
  const t = useTranslations("admin.components.jobStatus");

  const variant =
    status === "done" ? "good" : status === "failed" ? "bad" : status === "running" ? "run" : "neutral";

  const label =
    status === "done"
      ? t("done")
      : status === "failed"
        ? t("failed")
        : status === "running"
          ? t("running")
          : t("queued");

  return (
    <Badge variant={variant} rounding="square">
      {label}
    </Badge>
  );
}

/**
 * A Progress bar, a mono "412 / 1,308", an elapsed timer and a way out
 * (DESIGN 19.2). `jobs.status` is a subscription, so nothing polls.
 */
export function JobProgress({
  jobId,
  title,
  onDismiss,
  className,
}: {
  jobId: Id<"jobs"> | null;
  title?: string;
  onDismiss?: () => void;
  className?: string;
}) {
  const t = useTranslations("admin.components.jobProgress");
  const job = useQuery(api.jobs.status, jobId ? { jobId } : "skip");
  const [now, setNow] = useState(() => Date.now());

  const running = job?.status === "queued" || job?.status === "running";
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);

    return () => window.clearInterval(timer);
  }, [running]);

  const panelTitle = title ?? t("title");

  function elapsedText(from: number, to: number): string {
    const seconds = Math.max(0, Math.round((to - from) / 1000));

    if (seconds < 60) return t("elapsedSeconds", { seconds });
    const minutes = Math.floor(seconds / 60);

    if (minutes < 60) return t("elapsedMinutes", { minutes, seconds: seconds % 60 });

    return t("elapsedHours", { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
  }

  if (!jobId) return null;

  if (job === undefined) {
    return (
      <Panel title={panelTitle} className={className} bodyClassName="p-3">
        <p className="text-sm text-muted-foreground">{t("starting")}</p>
      </Panel>
    );
  }

  if (job === null) {
    return (
      <Panel title={panelTitle} className={className} bodyClassName="p-3">
        <p className="text-sm text-muted-foreground">{t("missing")}</p>
      </Panel>
    );
  }

  const total = job.progress?.total ?? 0;
  const done = job.progress?.done ?? 0;

  const percent =
    total > 0 ? Math.min(100, Math.round((done / total) * 100)) : job.status === "done" ? 100 : 0;

  const finishedAt = job.finishedAt ?? now;
  const typeName = t.has(`types.${job.type}`) ? t(`types.${job.type}`) : job.type;

  return (
    <Panel
      title={t("panelTitle", { type: typeName, title: panelTitle })}
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
            {running ? t("hide") : t("dismiss")}
          </Button>
        ) : null}
      </div>
      {job.error ? <p className={cn("text-sm text-danger-ink")}>{job.error}</p> : null}
    </Panel>
  );
}
