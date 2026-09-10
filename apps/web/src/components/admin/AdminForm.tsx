"use client";

import { Alert, AlertDescription, AlertTitle, Button, Field, FormFooter, Input } from "@moj/ui";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useId } from "react";

/**
 * Every edit form in the console: the fields, then the revision reason, then
 * the footer. The reason is required (SPEC section 8) and its help text says
 * where it ends up. Part 1 owns the canonical version of this file.
 */
export function AdminForm({
  children,
  onSubmit,
  reason,
  onReasonChange,
  reasonRequired = true,
  reasonLabel = "Reason for change",
  reasonHint = "Recorded on the revision so the next person can see why this changed.",
  dirty = false,
  busy = false,
  busyLabel = "Saving…",
  submitLabel = "Save",
  error,
  saved,
  actions,
  className,
}: {
  children: ReactNode;
  onSubmit: () => void | Promise<void>;
  reason: string;
  onReasonChange: (value: string) => void;
  reasonRequired?: boolean;
  reasonLabel?: string;
  reasonHint?: string;
  dirty?: boolean;
  busy?: boolean;
  busyLabel?: string;
  submitLabel?: string;
  error?: string | null;
  saved?: string | null;
  actions?: ReactNode;
  className?: string;
}) {
  const reasonId = useId();

  useEffect(() => {
    if (!dirty) return;
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function submit(event: FormEvent) {
    event.preventDefault();
    void onSubmit();
  }

  return (
    <form onSubmit={submit} className={className} noValidate>
      {saved ? (
        <Alert variant="success" className="mb-4">
          <CheckCircle2 className="size-3.5" aria-hidden />
          <AlertTitle>{saved}</AlertTitle>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="danger" className="mb-4">
          <AlertCircle className="size-3.5" aria-hidden />
          <AlertTitle>That could not be saved</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4">{children}</div>

      <div className="mt-4">
        <Field label={reasonLabel} htmlFor={reasonId} hint={reasonHint}>
          <Input
            id={reasonId}
            value={reason}
            required={reasonRequired}
            maxLength={200}
            onChange={(event) => onReasonChange(event.target.value)}
            placeholder="Fixed the memory limit after the judge timed out"
          />
        </Field>
      </div>

      <FormFooter note={dirty ? "Unsaved changes" : undefined}>
        {actions}
        <Button type="submit" busy={busy} disabled={busy}>
          {busy ? busyLabel : submitLabel}
        </Button>
      </FormFooter>
    </form>
  );
}
