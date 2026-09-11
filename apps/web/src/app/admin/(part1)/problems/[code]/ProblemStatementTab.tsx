"use client";

import { api } from "@convex/_generated/api";
import { Alert, AlertDescription, AlertTitle, Field, Panel, toast } from "@moj/ui";
import { useMutation } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { AdminForm, AdminFormError, AdminFormFooter, ReasonField } from "@/components/admin";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import type { ProblemEdit } from "./types";

export function ProblemStatementTab({ problem }: { problem: ProblemEdit }) {
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
      setReasonError("Say what you changed so the revision is worth reading.");
      return;
    }
    setReasonError(undefined);
    setBusy(true);
    try {
      await update({ code: problem.code, description, reason: reason.trim() });
      setReason("");
      toast.success("Statement saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The change was refused.");
    }
    setBusy(false);
  }

  if (locked) {
    return (
      <Alert variant="warning">
        <AlertTitle>This statement uses full markup</AlertTitle>
        <AlertDescription>
          Editing it needs judge.problem_full_markup, which this account does not have.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <AdminForm onSubmit={save}>
      <AdminFormError message={error} />
      <Panel title="Statement" bodyClassName="p-4">
        <Field
          label="Statement"
          hint={
            <>
              Markdown, with ~math~ and $math$ both accepted. It renders on{" "}
              <Link className="text-link hover:underline" href={`/problem/${problem.code}/`}>
                the problem page
              </Link>
              .
            </>
          }
        >
          <MarkdownEditor
            value={description}
            onChange={setDescription}
            preset={problem.isFullMarkup ? "problem-full" : "problem"}
            rows={26}
          />
        </Field>
      </Panel>
      <ReasonField value={reason} onChange={setReason} error={reasonError} entity="statement" />
      <AdminFormFooter dirty={description !== problem.description} busy={busy} submitLabel="Save statement" />
    </AdminForm>
  );
}
