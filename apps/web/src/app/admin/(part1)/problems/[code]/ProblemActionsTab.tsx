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
import { useTranslations } from "next-intl";
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
  const t = useTranslations("admin.problems.actions");
  const shared = useTranslations("admin.problems.shared");
  const commonActions = useTranslations("common.actions");
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
    idFrom.trim() && idTo.trim() ? { start: Number(idFrom) || 0, end: Number(idTo) || 0 } : undefined;
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
        toast.success(t("rejudgeQueued"));
      } else if (action === "rescore") {
        const result = await rescoreAll({ code: problem.code, reason: reason.trim() || undefined });
        setJobId(result.jobId);
        toast.success(t("rescoreQueued"));
      } else {
        await setVisibility({
          codes: [problem.code],
          isPublic: !problem.isPublic,
          reason: reason.trim() || undefined,
        });
        toast.success(problem.isPublic ? t("nowPrivate") : t("nowPublic"));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("actionRefused"));
    }
  }

  const canRejudge = problem.permissions.rejudgeSubmission && problem.permissions.rejudgeSubmissionLot;

  return (
    <div className="grid gap-4">
      <AdminFormError message={error} />
      {jobId ? <JobProgress jobId={jobId} title={problem.code} onDismiss={() => setJobId(null)} /> : null}

      <Panel title={t("rejudgePanel")} bodyClassName="grid gap-4 p-4">
        <p className="text-sm text-muted-foreground">
          {t("rejudgeIntro", { count: problem.submissionCount })}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("idFrom")} htmlFor={ids.idFrom} optional={shared("optional")}>
            <Input
              id={ids.idFrom}
              mono
              inputMode="numeric"
              value={idFrom}
              onChange={(event) => setIdFrom(event.target.value)}
              placeholder="1"
            />
          </Field>
          <Field label={t("idTo")} htmlFor={ids.idTo} optional={shared("optional")}>
            <Input
              id={ids.idTo}
              mono
              inputMode="numeric"
              value={idTo}
              onChange={(event) => setIdTo(event.target.value)}
              placeholder="99999"
            />
          </Field>
          <Field label={t("languages")} htmlFor={ids.languages} optional={shared("optional")}>
            <MultiSelect
              id={ids.languages}
              values={languages}
              onChange={setLanguages}
              options={(options?.languages ?? []).map((row) => ({ value: row.key, label: row.name }))}
              placeholder={shared("field.everyLanguage")}
            />
          </Field>
          <Field label={t("results")} htmlFor={ids.results} optional={shared("optional")}>
            <MultiSelect
              id={ids.results}
              values={results}
              onChange={setResults}
              options={RESULTS.map((code) => ({ value: code, label: code }))}
              placeholder={t("everyResult")}
            />
          </Field>
        </div>
        <AdminCheckField
          label={t("includeLocked")}
          hint={t("includeLockedHint")}
          checked={archiveLocked}
          onCheckedChange={setArchiveLocked}
        />
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
          <span className="font-mono text-sm tabular-nums text-subtle">
            {preview === undefined
              ? t("counting")
              : t("previewCount", { count: preview.count, total: preview.total })}
          </span>
          <Button
            className="ml-auto"
            disabled={!canRejudge || (preview?.count ?? 0) === 0}
            title={
              !canRejudge
                ? shared("missingPermission", { permission: "judge.rejudge_submission_lot" })
                : (preview?.count ?? 0) === 0
                  ? t("nothingMatches")
                  : undefined
            }
            onClick={() => setConfirm("rejudge")}
          >
            {t("rejudgeButton")}
          </Button>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t("rescorePanel")} bodyClassName="grid gap-3 p-4">
          <p className="text-sm text-muted-foreground">{t("rescoreDescription")}</p>
          <Button
            variant="secondary"
            className="w-fit"
            disabled={!problem.permissions.rejudgeSubmission}
            title={
              problem.permissions.rejudgeSubmission
                ? undefined
                : shared("missingPermission", { permission: "judge.rejudge_submission" })
            }
            onClick={() => setConfirm("rescore")}
          >
            {t("rescoreButton")}
          </Button>
        </Panel>

        <Panel title={t("visibilityPanel")} bodyClassName="grid gap-3 p-4">
          <p className="text-sm text-muted-foreground">
            {problem.isPublic ? t("visibilityPublic") : t("visibilityPrivate")}
          </p>
          <Button
            variant="secondary"
            className="w-fit"
            disabled={!problem.permissions.changePublicVisibility && !problem.isOrganizationPrivate}
            title={
              problem.permissions.changePublicVisibility
                ? undefined
                : shared("missingPermission", { permission: "judge.change_public_visibility" })
            }
            onClick={() => setConfirm("visibility")}
          >
            {problem.isPublic ? t("makePrivate") : t("makePublic")}
          </Button>
        </Panel>
      </div>

      <Panel title={t("clonePanel")} bodyClassName="grid gap-3 p-4">
        <p className="text-sm text-muted-foreground">{t("cloneDescription")}</p>
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t("cloneCode")} htmlFor={ids.clone} className="w-[220px]">
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
                  : t("cloneCodeRequired")
                : shared("missingPermission", { permission: "judge.clone_problem" })
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
                setError(caught instanceof Error ? caught.message : t("cloneRefused"));
              }
            }}
          >
            {t("cloneButton")}
          </Button>
        </div>
      </Panel>

      <Panel title={t("historyPanel")} bodyClassName="p-4">
        <Field label={t("reasonLabel")} hint={t("reasonHint")}>
          <Input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t("reasonPlaceholder")}
          />
        </Field>
      </Panel>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "rejudge"
                ? t("confirmRejudgeTitle", { count: preview?.count ?? 0 })
                : confirm === "rescore"
                  ? t("confirmRescoreTitle", { name: problem.name })
                  : problem.isPublic
                    ? t("confirmPrivateTitle", { name: problem.name })
                    : t("confirmPublicTitle", { name: problem.name })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "rejudge"
                ? t("confirmRejudgeBody")
                : confirm === "rescore"
                  ? t("confirmRescoreBody")
                  : problem.isPublic
                    ? t("confirmPrivateBody")
                    : t("confirmPublicBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{commonActions("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirm && run(confirm)}>
              {confirm === "rejudge"
                ? t("confirmRejudgeAction")
                : confirm === "rescore"
                  ? t("confirmRescoreAction")
                  : t("confirmVisibilityAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
