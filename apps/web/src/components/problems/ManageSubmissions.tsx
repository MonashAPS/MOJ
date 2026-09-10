"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  Alert,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertTitle,
  Button,
  Checkbox,
  Field,
  Input,
  MultiSelect,
  Panel,
  Progress,
} from "@moj/ui";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { TriangleAlert } from "lucide-react";
import { useState } from "react";
import { plural } from "@/lib/units";

/** DMOJ's `Submission.RESULT`, in its own order. */
const RESULTS = ["AC", "WA", "TLE", "MLE", "OLE", "IR", "RTE", "CE", "IE", "SC", "AB"];

function JobProgress({ jobId, label }: { jobId: Id<"jobs">; label: string }) {
  const job = useQuery(api.jobs.status, { jobId });
  if (!job) return null;
  const done = job.status === "done" || job.status === "failed";
  const total = job.progress?.total ?? 0;
  const complete = job.progress?.done ?? 0;

  return (
    <div className="grid gap-1.5 rounded-md border border-border bg-secondary p-3">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-subtle">
          {job.status === "failed" ? `${label} failed.` : done ? `${label} finished.` : `${label}…`}
        </span>
        <span className="font-mono tabular-nums text-muted-foreground">
          {complete.toLocaleString("en-AU")} / {total.toLocaleString("en-AU")}
        </span>
      </div>
      <Progress
        value={total > 0 ? Math.round((complete / total) * 100) : 0}
        tone={job.status === "failed" ? "bad" : done ? "good" : undefined}
      />
      {job.error ? <p className="text-sm text-bad">{job.error}</p> : null}
    </div>
  );
}

export function ManageSubmissions({
  problemCode,
  problemName,
  languages,
  canRejudge,
}: {
  problemCode: string;
  problemName: string;
  languages: { key: string; name: string }[];
  canRejudge: boolean;
}) {
  const [useRange, setUseRange] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [languageKeys, setLanguageKeys] = useState<string[]>([]);
  const [results, setResults] = useState<string[]>([]);
  const [archiveLocked, setArchiveLocked] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<"rejudge" | "rescore" | null>(null);
  const [rejudgeJob, setRejudgeJob] = useState<Id<"jobs"> | null>(null);
  const [rescoreJob, setRescoreJob] = useState<Id<"jobs"> | null>(null);
  const [busy, setBusy] = useState(false);

  const batchRejudge = useMutation(api.admin.submissions.batchRejudge);
  const rescoreProblem = useMutation(api.admin.submissions.rescoreProblem);

  const rangeValid = !useRange || (start.trim() !== "" && end.trim() !== "" && Number(end) >= Number(start));

  const preview = useQuery(
    api.pages.problems.rejudgePreview,
    canRejudge && rangeValid
      ? {
          problemCode,
          idRange: useRange ? [Number(start), Number(end)] : undefined,
          languageKeys: languageKeys.length > 0 ? languageKeys : undefined,
          results: results.length > 0 ? results : undefined,
          archiveLocked,
        }
      : "skip",
  );
  const totals = useQuery(api.submissions.resultsForProblem, { problemCode });
  const previewCount = preview?.count ?? null;
  const rescoreCount = totals?.total ?? 0;

  async function run(action: () => Promise<{ jobId: Id<"jobs"> }>, set: (id: Id<"jobs">) => void) {
    setBusy(true);
    setError(null);
    try {
      const { jobId } = await action();
      set(jobId);
    } catch (thrown) {
      setError(
        thrown instanceof ConvexError && typeof thrown.data === "object" && thrown.data !== null
          ? String((thrown.data as { message?: string }).message ?? "That job could not be started.")
          : "That job could not be started.",
      );
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  }

  return (
    <div className="grid items-start gap-4 md:grid-cols-2">
      {error ? (
        <Alert variant="danger" role="alert" className="md:col-span-2">
          <TriangleAlert size={16} aria-hidden />
          <AlertTitle>{error}</AlertTitle>
        </Alert>
      ) : null}

      {canRejudge ? (
        <Panel title="Rejudge submissions" bodyClassName="grid gap-4 p-3">
          <div className="grid gap-2">
            <Checkbox id="use-range" checked={useRange} onCheckedChange={setUseRange} label="Filter by ID" />
            <div className="grid grid-cols-2 gap-2">
              <Field label="Starting ID" htmlFor="range-start">
                <Input
                  id="range-start"
                  type="number"
                  mono
                  disabled={!useRange}
                  value={start}
                  onChange={(event) => setStart(event.target.value)}
                />
              </Field>
              <Field label="Ending ID" htmlFor="range-end">
                <Input
                  id="range-end"
                  type="number"
                  mono
                  disabled={!useRange}
                  value={end}
                  onChange={(event) => setEnd(event.target.value)}
                />
              </Field>
            </div>
            <p className="text-sm text-muted-foreground">This range includes both endpoints.</p>
            {rangeValid ? null : (
              <p className="text-sm text-bad">The ending ID must not come before the starting ID.</p>
            )}
          </div>

          <Field label="Filter by language" htmlFor="lang-filter">
            <MultiSelect
              id="lang-filter"
              options={languages.map((language) => ({ value: language.key, label: language.name }))}
              values={languageKeys}
              onChange={setLanguageKeys}
              placeholder="Any language"
              searchPlaceholder="Find a language…"
              emptyText="No languages match."
            />
          </Field>

          <Field label="Filter by result" htmlFor="result-filter">
            <MultiSelect
              id="result-filter"
              options={RESULTS.map((result) => ({ value: result, label: result }))}
              values={results}
              onChange={setResults}
              placeholder="Any result"
              searchPlaceholder="Find a result…"
              emptyText="No results match."
            />
          </Field>

          <Checkbox
            id="archive-locked"
            checked={archiveLocked}
            onCheckedChange={setArchiveLocked}
            label="Archive locked submissions"
          />

          <p className="border-t border-border pt-3 text-sm text-subtle">
            {previewCount === null
              ? "Counting the submissions this filter matches…"
              : `This will rejudge ${plural(previewCount, "submission")}.`}
          </p>

          <Button
            full
            disabled={!rangeValid || previewCount === 0}
            busy={busy}
            onClick={() => setConfirming("rejudge")}
          >
            Rejudge selected submissions
          </Button>

          {rejudgeJob ? <JobProgress jobId={rejudgeJob} label="Rejudging" /> : null}
        </Panel>
      ) : null}

      <Panel title="Rescore everything" bodyClassName="grid gap-4 p-3">
        <p className="text-sm text-subtle">This will rescore {plural(rescoreCount, "submission")}.</p>
        <Button full variant="secondary" busy={busy} onClick={() => setConfirming("rescore")}>
          Rescore all submissions
        </Button>
        {rescoreJob ? <JobProgress jobId={rescoreJob} label="Rescoring" /> : null}
      </Panel>

      <AlertDialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirming === "rescore"
                ? `Rescore ${plural(rescoreCount, "submission")} on ${problemName}?`
                : `Rejudge ${plural(previewCount ?? 0, "submission")} on ${problemName}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirming === "rescore"
                ? "Every submission keeps its verdict; only its score is recomputed."
                : "Each one goes back into the judging queue and its verdict may change."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirming === "rescore") {
                  void run(() => rescoreProblem({ problemCode }), setRescoreJob);
                } else {
                  void run(
                    () =>
                      batchRejudge({
                        problemCode,
                        idRange: useRange ? [Number(start), Number(end)] : undefined,
                        languageKeys: languageKeys.length > 0 ? languageKeys : undefined,
                        results: results.length > 0 ? results : undefined,
                        archiveLocked,
                      }),
                    setRejudgeJob,
                  );
                }
              }}
            >
              {confirming === "rescore" ? "Rescore" : "Rejudge"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
