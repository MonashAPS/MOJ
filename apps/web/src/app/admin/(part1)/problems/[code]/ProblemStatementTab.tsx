"use client";

import { api } from "@convex/_generated/api";
import { Alert, AlertDescription, AlertTitle, Field, Panel, toast } from "@moj/ui";
import { useMutation } from "convex/react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AdminForm, AdminFormError, AdminFormFooter, ReasonField } from "@/components/admin";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import type { ProblemEdit } from "./types";

export function ProblemStatementTab({ problem }: { problem: ProblemEdit }) {
  const t = useTranslations("admin.problems.statement");
  const shared = useTranslations("admin.problems.shared");
  const update = useMutation(api.admin.problems.update);
  const [description, setDescription] = useState(problem.description);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const locked = problem.isFullMarkup && !problem.permissions.problemFullMarkup;

  async function save() {
    setError(null);
    if (!reason.trim()) {
      setReasonError(shared("reasonRequired"));
      return;
    }
    setReasonError(undefined);
    setBusy(true);
    try {
      await update({ code: problem.code, description, reason: reason.trim() });
      setReason("");
      toast.success(t("saved"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : shared("changeRefused"));
    }
    setBusy(false);
  }

  if (locked) {
    return (
      <Alert variant="warning">
        <AlertTitle>{t("lockedTitle")}</AlertTitle>
        <AlertDescription>
          {t("lockedDescription", { permission: "judge.problem_full_markup" })}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <AdminForm onSubmit={save}>
      <AdminFormError message={error} />
      <Panel title={shared("panel.statement")} bodyClassName="p-4">
        <Field
          label={shared("field.statement")}
          hint={t.rich("hint", {
            link: (chunks) => (
              <Link className="text-link hover:underline" href={`/problem/${problem.code}/`}>
                {chunks}
              </Link>
            ),
          })}
        >
          <MarkdownEditor
            value={description}
            onChange={setDescription}
            preset={problem.isFullMarkup ? "problem-full" : "problem"}
            rows={26}
          />
        </Field>
      </Panel>
      <ReasonField value={reason} onChange={setReason} error={reasonError} hint={t("reasonHint")} />
      <AdminFormFooter dirty={description !== problem.description} busy={busy} submitLabel={t("submit")} />
    </AdminForm>
  );
}
