"use client";

import { Alert, AlertDescription, Button, cn } from "@moj/ui";
import { X } from "lucide-react";
import { useState } from "react";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import { mutationError } from "@/lib/convex-error";

export type CommentFormProps = {
  /** Throws to put the message it was given under the editor. */
  onSubmit: (body: string) => Promise<unknown>;
  heading?: string;
  submitLabel?: string;
  placeholder?: string;
  initialValue?: string;
  /** Omitted where the mutation imposes no limit, as on a ticket message. */
  maxLength?: number;
  preset?: string;
  rows?: number;
  autoFocus?: boolean;
  onCancel?: () => void;
  clearOnSuccess?: boolean;
  className?: string;
};

/**
 * DMOJ's Martor form: write, preview, post — and the post button does not work
 * until the current text has been previewed, which is what Martor's
 * `editor_msg` asks for.
 */
export function CommentForm({
  onSubmit,
  heading,
  submitLabel = "Post!",
  placeholder = "Write a comment…",
  initialValue = "",
  maxLength,
  preset = "comment",
  rows = 7,
  autoFocus = false,
  onCancel,
  clearOnSuccess = true,
  className,
}: CommentFormProps) {
  const [body, setBody] = useState(initialValue);
  const [previewed, setPreviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const empty = body.trim().length === 0;
  const blocked = empty || !previewed || busy;
  const reason = empty
    ? "Write something first."
    : previewed
      ? undefined
      : "Preview your comment before posting.";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (blocked) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(body.trim());
      if (clearOnSuccess) {
        setBody("");
        setPreviewed(false);
      }
    } catch (thrown) {
      setError(mutationError(thrown, "Your comment was not posted."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className={cn("grid gap-3", className)}>
      {heading ? (
        <div className="flex items-center gap-2">
          <h3 className="min-w-0 flex-1">{heading}</h3>
          {onCancel ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Close"
              title="Close"
              onClick={onCancel}
              className="shrink-0 text-muted-foreground"
            >
              <X aria-hidden />
            </Button>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <Alert variant="danger">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <MarkdownEditor
        value={body}
        onChange={setBody}
        preset={preset}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        ariaLabel={heading ?? "Comment body"}
        autoFocus={autoFocus}
        disabled={busy}
        onPreviewedChange={setPreviewed}
      />

      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 text-sm text-muted-foreground">
          {reason ?? "Markdown, with maths between tildes."}
        </span>
        {onCancel && !heading ? (
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" disabled={blocked} busy={busy} title={reason}>
          {busy ? "Posting…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
