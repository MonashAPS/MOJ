"use client";

import { api } from "@convex/_generated/api";
import { Alert, AlertDescription, AlertTitle, Field, Panel, toast } from "@moj/ui";
import { useMutation } from "convex/react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AdminForm, AdminFormError, AdminFormFooter } from "@/components/admin";
import { previewStatementAction } from "@/components/admin/actions";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import { Statement } from "@/components/problems/Statement";
import type { ProblemEdit } from "./types";

export function ProblemStatementTab({ problem }: { problem: ProblemEdit }) {
  const t = useTranslations("admin.problems.statement");
  const shared = useTranslations("admin.problems.shared");
  const update = useMutation(api.admin.problems.update);
  const [description, setDescription] = useState(problem.description);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const locked = problem.isFullMarkup && !problem.permissions.problemFullMarkup;
  const preset = problem.isFullMarkup ? "problem-full" : "problem";

  /** The public preview refuses `problem-full` and decorates nothing, so the
   *  console renders through its own staff-gated action instead. */
  async function renderPreview(source: string): Promise<string> {
    const result = await previewStatementAction(source, preset);

    if (result.ok) return result.data;
    setError(result.error);

    return "";
  }

  async function save() {
    setError(null);
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
            preset={preset}
            rows={26}
            renderPreview={renderPreview}
            renderPreviewHtml={(html) => <Statement html={html} />}
          />
        </Field>
      </Panel>
      <AdminFormFooter dirty={description !== problem.description} busy={busy} submitLabel={t("submit")} />
    </AdminForm>
  );
}
