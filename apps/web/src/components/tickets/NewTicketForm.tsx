"use client";

import { api } from "@convex/_generated/api";
import { Alert, AlertDescription, AlertTitle, Button, Field, FormFooter, Input } from "@moj/ui";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import { mutationError } from "@/lib/convex-error";

/** `Ticket.title` max_length (judge/models/ticket.py). */
const MAX_TITLE = 100;

/** `ticket_widget.editor_msg` (judge/views/ticket.py:28). */
const PREVIEW_MESSAGE = 'Please click on "Preview" before creating your ticket.';

export function NewTicketForm({
  problemCode,
  showGuideline = false,
}: {
  problemCode?: string;
  /** `ticket/new_problem.html`: shown outside a contest only. */
  showGuideline?: boolean;
}) {
  const create = useMutation(api.tickets.create);
  const router = useRouter();
  const titleId = useId();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [previewed, setPreviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const missingTitle = title.trim().length === 0;
  const missingBody = body.trim().length === 0;
  const reason = missingTitle
    ? "A ticket needs a title."
    : missingBody
      ? "A ticket needs a message."
      : previewed
        ? undefined
        : PREVIEW_MESSAGE;
  const blocked = reason !== undefined || busy;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (blocked) return;
    setBusy(true);
    setError(null);
    try {
      const id = await create({ title: title.trim(), body: body.trim(), problemCode });
      router.push(`/ticket/${id}/`);
    } catch (thrown) {
      setError(mutationError(thrown, "The ticket was not created."));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      {showGuideline && !dismissed ? (
        <Alert variant="warning">
          <AlertTitle>Thanks for opening a ticket!</AlertTitle>
          <AlertDescription>
            <p>
              Please keep in mind that this form is for reporting issues with a problem statement, and not for
              asking for help. If you require assistance on solving a problem, ask in the comments instead.
            </p>
            <Button variant="link" size="sm" onClick={() => setDismissed(true)} className="px-0">
              Dismiss
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="danger">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Field label="Ticket title" htmlFor={titleId}>
        <Input
          id={titleId}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={MAX_TITLE}
          placeholder="Ticket title"
          autoComplete="off"
          disabled={busy}
        />
      </Field>

      <Field label="Message" htmlFor="ticket-body">
        <MarkdownEditor
          id="ticket-body"
          value={body}
          onChange={setBody}
          preset="ticket"
          rows={10}
          placeholder="What is wrong, and what did you expect?"
          ariaLabel="Ticket message"
          disabled={busy}
          onPreviewedChange={setPreviewed}
        />
      </Field>

      <FormFooter note={reason}>
        <Button type="submit" disabled={blocked} busy={busy} title={reason}>
          {busy ? "Creating…" : "Create"}
        </Button>
      </FormFooter>
    </form>
  );
}
