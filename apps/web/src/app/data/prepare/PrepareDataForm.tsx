"use client";

import { api } from "@convex/_generated/api";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Checkbox,
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTrigger,
  Field,
  Input,
  MultiSelect,
  Panel,
  Progress,
  toast,
} from "@moj/ui";
import { useMutation, useQuery } from "convex/react";
import { Download } from "lucide-react";
import { useState } from "react";
import { formatDateTime } from "@/lib/format";

/** `Submission.RESULT`, sorted, as `DownloadDataForm.submission_results` offers. */
const RESULTS = ["AB", "AC", "CE", "IE", "IR", "MLE", "OLE", "RTE", "TLE", "WA"].map((code) => ({
  value: code,
  label: code,
}));

function duration(ms: number) {
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.round((ms % 3_600_000) / 60_000);

  if (hours >= 1) return `${hours} ${hours === 1 ? "hour" : "hours"} ${minutes} min`;

  return `${Math.max(1, minutes)} min`;
}

/** `user/prepare-data.html`: pick what goes in the archive, watch the job, then
 *  take the link. */
export function PrepareDataForm() {
  const status = useQuery(api.profiles.dataExport.status, {});
  const prepare = useMutation(api.profiles.dataExport.prepare);

  const [comments, setComments] = useState(true);
  const [submissions, setSubmissions] = useState(true);
  const [glob, setGlob] = useState("*");
  const [results, setResults] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  if (status === undefined) {
    return (
      <Panel title="Data download" bodyClassName="p-4">
        Loading your download…
      </Panel>
    );
  }

  const job = status.job;
  const running = job?.status === "queued" || job?.status === "running";
  const nothingChosen = !comments && !submissions;

  async function submit() {
    setBusy(true);

    try {
      await prepare({
        options: {
          commentDownload: comments,
          submissionDownload: submissions,
          submissionProblemGlob: glob || "*",
          submissionResults: results,
        },
      });
      toast.success("Your data is being prepared.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid max-w-[46rem] gap-4">
      {running ? (
        <Alert variant="info">
          <AlertTitle>We are currently preparing your data.</AlertTitle>
          <AlertDescription>
            <span className="block font-mono text-sm tabular-nums">
              {job?.progress.stage} — {job?.progress.done} of {job?.progress.total}
            </span>
            <Progress
              className="mt-2"
              value={job && job.progress.total > 0 ? (job.progress.done / job.progress.total) * 100 : 0}
            />
          </AlertDescription>
        </Alert>
      ) : null}

      {job?.status === "failed" ? (
        <Alert variant="danger">
          <AlertTitle>Preparing your data did not finish.</AlertTitle>
          <AlertDescription>
            {job.error ?? "Try again, and tell an admin if it keeps failing."}
          </AlertDescription>
        </Alert>
      ) : null}

      {status.download ? (
        <Alert variant="success">
          <AlertTitle>Your data is ready.</AlertTitle>
          <AlertDescription>
            Prepared {formatDateTime(status.download.createdAt)}.
            {status.msUntilCanPrepare > 0
              ? ` You will be able to prepare a new download in ${duration(status.msUntilCanPrepare)}.`
              : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <Panel title="What to include" bodyClassName="grid gap-4 p-4">
        <Checkbox
          label="Download comments?"
          checked={comments}
          onCheckedChange={(next) => setComments(next === true)}
        />
        <Checkbox
          label="Download submissions?"
          checked={submissions}
          onCheckedChange={(next) => setSubmissions(next === true)}
        />

        {submissions ? (
          <div className="grid gap-4 border-t border-border pt-4">
            <Field label="Filter by problem code glob" htmlFor="glob">
              <Input
                id="glob"
                mono
                value={glob}
                maxLength={100}
                onChange={(event) => setGlob(event.target.value)}
              />
            </Field>
            <Field label="Filter by result" htmlFor="results" hint="Leave empty to include all submissions.">
              <MultiSelect
                id="results"
                options={RESULTS}
                values={results}
                onChange={setResults}
                placeholder="Any result"
              />
            </Field>
          </div>
        ) : null}

        <p className="text-sm text-muted-foreground">
          You may only prepare a new data download once every {duration(status.rateLimitMs)}. Once your data
          is ready, you will find a download link on this page.
        </p>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
          {status.download ? (
            <Button variant="secondary" asChild icon={<Download aria-hidden />}>
              <a href="/data/download/">Download prepared data</a>
            </Button>
          ) : null}
          <Dialog>
            <DialogTrigger asChild>
              <Button
                disabled={!status.canPrepare || nothingChosen || busy}
                title={
                  nothingChosen
                    ? "Pick at least one thing to download."
                    : status.canPrepare
                      ? undefined
                      : running
                        ? "Your data is already being prepared."
                        : `You can prepare a new download in ${duration(status.msUntilCanPrepare)}.`
                }
              >
                {status.download ? "Prepare new download" : "Prepare download"}
              </Button>
            </DialogTrigger>
            <DialogContent
              title="Prepare a download?"
              description="It can take a few minutes, and you can only ask once a day."
            >
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="secondary">Cancel</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button busy={busy} onClick={submit}>
                    Prepare download
                  </Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        {nothingChosen ? (
          <p className="text-right text-sm text-bad">Please select at least one thing to download.</p>
        ) : null}
      </Panel>
    </div>
  );
}
