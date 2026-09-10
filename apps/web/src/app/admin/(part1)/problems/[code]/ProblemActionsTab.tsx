"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Field,
  Input,
  MultiSelect,
  Panel,
  toast,
} from "@moj/ui";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { AdminCheckField, AdminFormError, JobProgress } from "@/components/admin";
import type { ProblemEdit, ProblemOptions } from "./types";

const RESULTS = ["AC", "WA", "TLE", "MLE", "OLE", "IR", "RTE", "CE", "IE", "SC", "AB"];

/**
 * `problem_manage.py`: rejudge with DMOJ's filter set and a preview of how many
 * submissions it would touch, rescore, flip visibility, and clone.
 */
export function ProblemActionsTab({
  problem,
  options,
}: {
  problem: ProblemEdit;
  options: ProblemOptions | undefined;
}) {
  const router = useRouter();
  const rejudgeAll = useMutation(api.admin.problems.rejudgeAll);
  const rescoreAll = useMutation(api.admin.problems.rescoreAll);
  const setVisibility = useMutation(api.admin.problems.setVisibility);
  const cloneProblem = useMutation(api.pages.admin1.cloneProblem);

  const ids = { idFrom: useId(), idTo: useId(), languages: useId(), results: useId(), clone: useId() };
  const [idFrom, setIdFrom] = useState("");
  const [idTo, setIdTo] = useState("");
  const [languages, setLanguages] = useState<string[]>([]);
  const [results, setResults] = useState<string[]>([]);
  const [archiveLocked, setArchiveLocked] = useState(false);
  const [reason, setReason] = useState("");
  const [jobId, setJobId] = useState<Id<"jobs"> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"rejudge" | "rescore" | "visibility" | null>(null);
  const [cloneCode, setCloneCode] = useState("");

  const range =
    idFrom.trim() && idTo.trim()
      ? { start: Number(idFrom) || 0, end: Number(idTo) || 0 }
      : undefined;
  const preview = useQuery(
    api.admin.problems.rejudgePreview,
    problem.permissions.rejudgeSubmission
      ? {
          code: problem.code,
          idRange: range,
          languages: languages.length > 0 ? languages : undefined,
          results: results.length > 0 ? results : undefined,
          archiveLocked,
        }
      : "skip",
  );

  async function run(action: "rejudge" | "rescore" | "visibility") {
    setConfirm(null);
    setError(null);
    try {
      if (action === "rejudge") {
        const result = await rejudgeAll({
          code: problem.code,
          idRange: range,
          languages: languages.length > 0 ? languages : undefined,
          results: results.length > 0 ? results : undefined,
          archiveLocked,
          reason: reason.trim() || undefined,
        });
        setJobId(result.jobId);
        toast.success("Rejudge queued");
      } else if (action === "rescore") {
        const result = await rescoreAll({ code: problem.code, reason: reason.trim() || undefined });
        setJobId(result.jobId);
        toast.success("Rescore queued");
      } else {
        await setVisibility({
          codes: [problem.code],
          isPublic: !problem.isPublic,
          reason: reason.trim() || undefined,
        });
        toast.success(problem.isPublic ? "Problem is now private." : "Problem is now public.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The action was refused.");
    }
  }

  const canRejudge = problem.permissions.rejudgeSubmission && problem.permissions.rejudgeSubmissionLot;

  return (
    <div className="grid gap-4">
      <AdminFormError message={error} />
      {jobId ? <JobProgress jobId={jobId} title={problem.code} onDismiss={() => setJobId(null)} /> : null}

      <Panel title="Rejudge submissions" bodyClassName="grid gap-4 p-4">
        <p className="text-sm text-muted-foreground">
          Every submission matching the filter goes back in the queue at batch-rejudge priority. Leave a
          filter empty to match everything. This problem has {problem.submissionCount.toLocaleString("en-AU")}{" "}
          {problem.submissionCount === 1 ? "submission" : "submissions"}.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="From submission id" htmlFor={ids.idFrom} optional=" (optional)">
            <Input
              id={ids.idFrom}
              mono
              inputMode="numeric"
              value={idFrom}
              onChange={(event) => setIdFrom(event.target.value)}
              placeholder="1"
            />
          </Field>
          <Field label="To submission id" htmlFor={ids.idTo} optional=" (optional)">
            <Input
              id={ids.idTo}
              mono
              inputMode="numeric"
              value={idTo}
              onChange={(event) => setIdTo(event.target.value)}
              placeholder="99999"
            />
          </Field>
          <Field label="Languages" htmlFor={ids.languages} optional=" (optional)">
            <MultiSelect
              id={ids.languages}
              values={languages}
              onChange={setLanguages}
              options={(options?.languages ?? []).map((row) => ({ value: row.key, label: row.name }))}
              placeholder="Every language"
            />
          </Field>
          <Field label="Results" htmlFor={ids.results} optional=" (optional)">
            <MultiSelect
              id={ids.results}
              values={results}
              onChange={setResults}
              options={RESULTS.map((code) => ({ value: code, label: code }))}
              placeholder="Every result"
            />
          </Field>
        </div>
        <AdminCheckField
          label="Include locked submissions"
          hint="Submissions locked after a contest are skipped unless this is ticked."
          checked={archiveLocked}
          onCheckedChange={setArchiveLocked}
        />
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
          <span className="font-mono text-sm tabular-nums text-subtle">
            {preview === undefined
              ? "Counting…"
              : `${preview.count.toLocaleString("en-AU")} of ${preview.total.toLocaleString("en-AU")} would be rejudged`}
          </span>
          <Button
            className="ml-auto"
            disabled={!canRejudge || (preview?.count ?? 0) === 0}
            title={
              !canRejudge
                ? "You do not have judge.rejudge_submission_lot."
                : (preview?.count ?? 0) === 0
                  ? "Nothing matches this filter."
                  : undefined
            }
            onClick={() => setConfirm("rejudge")}
          >
            Rejudge these
          </Button>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Rescore" bodyClassName="grid gap-3 p-4">
          <p className="text-sm text-muted-foreground">
            Recalculates every submission's points from the case points already on record, then the users'
            totals. Nothing is regraded, so it is quick and safe after a points change.
          </p>
          <Button
            variant="secondary"
            className="w-fit"
            disabled={!problem.permissions.rejudgeSubmission}
            title={
              problem.permissions.rejudgeSubmission
                ? undefined
                : "You do not have judge.rejudge_submission."
            }
            onClick={() => setConfirm("rescore")}
          >
            Rescore every submission
          </Button>
        </Panel>

        <Panel title="Visibility" bodyClassName="grid gap-3 p-4">
          <p className="text-sm text-muted-foreground">
            {problem.isPublic
              ? "This problem is listed on /problems/ and counts towards points."
              : "This problem is hidden from the problem list. Its staff can still open it."}
          </p>
          <Button
            variant="secondary"
            className="w-fit"
            disabled={!problem.permissions.changePublicVisibility && !problem.isOrganizationPrivate}
            title={
              problem.permissions.changePublicVisibility
                ? undefined
                : "You do not have judge.change_public_visibility."
            }
            onClick={() => setConfirm("visibility")}
          >
            {problem.isPublic ? "Make private" : "Make public"}
          </Button>
        </Panel>
      </div>

      <Panel title="Clone" bodyClassName="grid gap-3 p-4">
        <p className="text-sm text-muted-foreground">
          Copies the statement, limits and taxonomy under a new code. The copy is private, has you as its only
          author, and carries no test data or submissions.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="New problem code" htmlFor={ids.clone} className="w-[220px]">
            <Input
              id={ids.clone}
              mono
              value={cloneCode}
              maxLength={20}
              onChange={(event) => setCloneCode(event.target.value.toLowerCase())}
              placeholder={`${problem.code}2`}
            />
          </Field>
          <Button
            variant="secondary"
            disabled={!problem.permissions.cloneProblem || !cloneCode.trim()}
            title={
              problem.permissions.cloneProblem
                ? cloneCode.trim()
                  ? undefined
                  : "Give the copy a code first."
                : "You do not have judge.clone_problem."
            }
            onClick={async () => {
              setError(null);
              try {
                const result = await cloneProblem({
                  code: problem.code,
                  newCode: cloneCode.trim(),
                  reason: reason.trim() || undefined,
                });
                router.push(`/admin/problems/${result.code}/`);
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : "The clone was refused.");
              }
            }}
          >
            Clone problem
          </Button>
        </div>
      </Panel>

      <Panel title="History" bodyClassName="p-4">
        <Field
          label="Reason for change"
          hint="Kept with the revision every action above writes."
        >
          <Input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Describe the change"
          />
        </Field>
      </Panel>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "rejudge"
                ? `Rejudge ${preview?.count ?? 0} ${preview?.count === 1 ? "submission" : "submissions"}?`
                : confirm === "rescore"
                  ? `Rescore every submission to ${problem.name}?`
                  : problem.isPublic
                    ? `Make ${problem.name} private?`
                    : `Make ${problem.name} public?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "rejudge"
                ? "They queue behind everything else, so contests are unaffected. The old verdicts are replaced as each one finishes."
                : confirm === "rescore"
                  ? "Points are recalculated from the stored case points, and every affected user's total is recomputed."
                  : problem.isPublic
                    ? "It disappears from the problem list and stops counting towards points. Submissions are kept."
                    : "It appears in the problem list and starts counting towards points."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirm && run(confirm)}>
              {confirm === "rejudge" ? "Rejudge" : confirm === "rescore" ? "Rescore" : "Change visibility"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
