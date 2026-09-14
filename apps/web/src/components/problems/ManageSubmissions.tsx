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
import { useTranslations } from "next-intl";
import { useState } from "react";

/** DMOJ's `Submission.RESULT`, in its own order. */
const RESULTS = ["AC", "WA", "TLE", "MLE", "OLE", "IR", "RTE", "CE", "IE", "SC", "AB"];

function JobProgress({ jobId, kind }: { jobId: Id<"jobs">; kind: "rejudge" | "rescore" }) {
  const t = useTranslations("problems.manage");
  const job = useQuery(api.jobs.status, { jobId });
  if (!job) return null;
  const done = job.status === "done" || job.status === "failed";
  const total = job.progress?.total ?? 0;
  const complete = job.progress?.done ?? 0;

  return (
    <div className="grid gap-1.5 rounded-md border border-border bg-secondary p-3">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-subtle">
          {job.status === "failed"
            ? t("jobFailed", { kind })
            : done
              ? t("jobFinished", { kind })
              : t("jobRunning", { kind })}
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
  const t = useTranslations("problems.manage");
  const actions = useTranslations("common.actions");
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
          ? String((thrown.data as { message?: string }).message ?? t("jobNotStarted"))
          : t("jobNotStarted"),
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
        <Panel title={t("rejudgeTitle")} bodyClassName="grid gap-4 p-3">
          <div className="grid gap-2">
            <Checkbox
              id="use-range"
              checked={useRange}
              onCheckedChange={setUseRange}
              label={t("filterById")}
            />
            <div className="grid grid-cols-2 gap-2">
              <Field label={t("startingId")} htmlFor="range-start">
                <Input
                  id="range-start"
                  type="number"
                  mono
                  disabled={!useRange}
                  value={start}
                  onChange={(event) => setStart(event.target.value)}
                />
              </Field>
              <Field label={t("endingId")} htmlFor="range-end">
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
            <p className="text-sm text-muted-foreground">{t("rangeInclusive")}</p>
            {rangeValid ? null : <p className="text-sm text-bad">{t("rangeInvalid")}</p>}
          </div>

          <Field label={t("filterByLanguage")} htmlFor="lang-filter">
            <MultiSelect
              id="lang-filter"
              options={languages.map((language) => ({ value: language.key, label: language.name }))}
              values={languageKeys}
              onChange={setLanguageKeys}
              placeholder={t("anyLanguage")}
              searchPlaceholder={t("findLanguage")}
              emptyText={t("noLanguages")}
            />
          </Field>

          <Field label={t("filterByResult")} htmlFor="result-filter">
            <MultiSelect
              id="result-filter"
              options={RESULTS.map((result) => ({ value: result, label: result }))}
              values={results}
              onChange={setResults}
              placeholder={t("anyResult")}
              searchPlaceholder={t("findResult")}
              emptyText={t("noResults")}
            />
          </Field>

          <Checkbox
            id="archive-locked"
            checked={archiveLocked}
            onCheckedChange={setArchiveLocked}
            label={t("archiveLocked")}
          />

          <p className="border-t border-border pt-3 text-sm text-subtle">
            {previewCount === null ? t("counting") : t("willRejudge", { count: previewCount })}
          </p>

          <Button
            full
            disabled={!rangeValid || previewCount === 0}
            busy={busy}
            onClick={() => setConfirming("rejudge")}
          >
            {t("rejudgeSelected")}
          </Button>

          {rejudgeJob ? <JobProgress jobId={rejudgeJob} kind="rejudge" /> : null}
        </Panel>
      ) : null}

      <Panel title={t("rescoreTitle")} bodyClassName="grid gap-4 p-3">
        <p className="text-sm text-subtle">{t("willRescore", { count: rescoreCount })}</p>
        <Button full variant="secondary" busy={busy} onClick={() => setConfirming("rescore")}>
          {t("rescoreAll")}
        </Button>
        {rescoreJob ? <JobProgress jobId={rescoreJob} kind="rescore" /> : null}
      </Panel>

      <AlertDialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirming === "rescore"
                ? t("confirmRescoreTitle", { count: rescoreCount, name: problemName })
                : t("confirmRejudgeTitle", { count: previewCount ?? 0, name: problemName })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirming === "rescore" ? t("confirmRescoreBody") : t("confirmRejudgeBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{actions("cancel")}</AlertDialogCancel>
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
              {confirming === "rescore" ? t("rescoreAction") : t("rejudgeAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
