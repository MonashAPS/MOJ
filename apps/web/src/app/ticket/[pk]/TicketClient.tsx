"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  Alert,
  AlertDescription,
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  cn,
  ContentDescription,
  Dialog,
  DialogContent,
  DialogFooter,
  MultiSelect,
  Panel,
  RatingName,
  Textarea,
  TitleRow,
  TwoColumn,
} from "@moj/ui";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { CircleAlert, CircleCheck, Pencil } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CommentForm } from "@/components/comments/CommentForm";
import { renderUserMarkdownBatch } from "@/components/markdown/actions";
import { identiconUrl, initials } from "@/lib/avatar";
import { mutationError } from "@/lib/convex-error";
import { formatDateTime, formatRelative } from "@/lib/format";

export type TicketDetail = NonNullable<FunctionReturnType<typeof api.tickets.get>>;
type TicketMessage = TicketDetail["messages"][number];

function messageKey(message: { _id: string; body: string }): string {
  return `${message._id} ${message.body}`;
}

export function TicketClient({
  ticketId,
  initial,
  initialHtml,
}: {
  ticketId: Id<"tickets">;
  initial: TicketDetail;
  initialHtml: Record<string, string>;
}) {
  const live = useQuery(api.tickets.get, { id: ticketId });
  const ticket = live ?? initial;

  const reply = useMutation(api.tickets.reply);
  const setOpen = useMutation(api.tickets.setOpen);

  const [html, setHtml] = useState(initialHtml);
  const requested = useRef(new Set(Object.keys(initialHtml)));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const missing = ticket.messages
      .map((message) => ({ key: messageKey(message), source: message.body, preset: message.bodyPreset }))
      .filter((item) => !requested.current.has(item.key));
    if (missing.length === 0) return;
    for (const item of missing) requested.current.add(item.key);

    let alive = true;
    void renderUserMarkdownBatch(missing).then((rendered) => {
      if (alive) setHtml((previous) => ({ ...previous, ...rendered }));
    });
    return () => {
      alive = false;
    };
  }, [ticket.messages]);

  async function toggleOpen() {
    setError(null);
    try {
      await setOpen({ ticketId, open: !ticket.isOpen });
    } catch (thrown) {
      setError(mutationError(thrown, "The ticket was not changed."));
    }
  }

  const state = ticket.isOpen ? "Open" : "Closed";

  return (
    <>
      <TitleRow
        title={
          <span className="flex min-w-0 items-center gap-2">
            {ticket.isOpen ? (
              <CircleAlert className="size-5 shrink-0 text-warn" aria-label={state} />
            ) : (
              <CircleCheck className="size-5 shrink-0 text-good" aria-label={state} />
            )}
            <span className="min-w-0">{ticket.title}</span>
            <span className="shrink-0 font-mono text-h3 font-medium tabular-nums text-muted-foreground">
              #{ticket.legacyId ?? ""}
            </span>
          </span>
        }
        action={
          ticket.canSetOpen ? (
            <Button variant={ticket.isOpen ? "secondary" : "primary"} onClick={toggleOpen}>
              {ticket.isOpen ? "Close ticket" : "Reopen ticket"}
            </Button>
          ) : null
        }
      />

      <div id="content-body">
        {error ? (
          <Alert variant="danger" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <TwoColumn
          side={
            <>
              {ticket.linkedHref ? (
                <Panel title="Associated object">
                  <Link href={`${ticket.linkedHref}/`} className="text-link">
                    {ticket.linkedTitle}
                  </Link>
                </Panel>
              ) : null}

              <AssigneesPanel ticket={ticket} ticketId={ticketId} />

              {ticket.canEditNotes ? <NotesPanel ticket={ticket} ticketId={ticketId} /> : null}
            </>
          }
        >
          <div className="grid">
            {ticket.messages.map((message) => (
              <Message key={message._id} message={message} html={html[messageKey(message)] ?? ""} />
            ))}
          </div>

          <hr className="my-6 border-0 border-t border-border" />

          {ticket.canReply ? (
            <CommentForm
              preset="ticket"
              submitLabel="Post!"
              placeholder="Write a message…"
              rows={6}
              onSubmit={(body) => reply({ ticketId, body })}
            />
          ) : (
            <Alert variant="info">
              <AlertDescription>Your part is silent, little toad.</AlertDescription>
            </Alert>
          )}
        </TwoColumn>
      </div>
    </>
  );
}

function Message({ message, html }: { message: TicketMessage; html: string }) {
  const author = message.author;
  return (
    <section id={`message-${message._id}`} className="flex gap-3 border-t border-border py-4 first:border-t-0 first:pt-0">
      <Avatar className="mt-0.5 size-7 shrink-0">
        <AvatarImage src={identiconUrl(author?.username ?? "deleted", 56)} alt="" />
        <AvatarFallback>{initials(author?.displayName ?? "?")}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {author ? (
            <RatingName
              username={author.username}
              displayName={author.displayName}
              rating={author.rating}
              href={`/user/${author.username}/`}
              isAdmin={author.displayRank === "admin"}
            />
          ) : (
            <span className="font-mono text-muted-foreground">deleted user</span>
          )}
          <time
            dateTime={new Date(message.time).toISOString()}
            title={formatDateTime(message.time)}
            className="text-sm text-muted-foreground"
          >
            messaged {formatRelative(message.time)}
          </time>
        </header>
        <ContentDescription html={html} className="mt-2" />
      </div>
    </section>
  );
}

function AssigneesPanel({ ticket, ticketId }: { ticket: TicketDetail; ticketId: Id<"tickets"> }) {
  const [editing, setEditing] = useState(false);
  const title = ticket.assignees.length === 1 ? "Assignee" : "Assignees";

  return (
    <Panel
      title={title}
      action={
        ticket.canAssign ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Edit assignees"
            title="Edit assignees"
            onClick={() => setEditing(true)}
            className="text-muted-foreground"
          >
            <Pencil aria-hidden />
          </Button>
        ) : null
      }
    >
      {ticket.assignees.length === 0 ? (
        <p className="text-sm text-muted-foreground">No one is assigned.</p>
      ) : (
        <ul className="grid gap-1">
          {ticket.assignees.map((one) => (
            <li key={one._id}>
              <RatingName
                username={one.username}
                displayName={one.displayName}
                rating={one.rating}
                href={`/user/${one.username}/`}
                isAdmin={one.displayRank === "admin"}
              />
            </li>
          ))}
        </ul>
      )}
      {ticket.canAssign ? (
        <AssigneesDialog ticket={ticket} ticketId={ticketId} open={editing} onOpenChange={setEditing} />
      ) : null}
    </Panel>
  );
}

function AssigneesDialog({
  ticket,
  ticketId,
  open,
  onOpenChange,
}: {
  ticket: TicketDetail;
  ticketId: Id<"tickets">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const staff = useQuery(api.profiles.listStaff, open ? {} : "skip");
  const assign = useMutation(api.tickets.assign);
  const [values, setValues] = useState<string[]>(() => ticket.assignees.map((one) => one._id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) setValues(ticket.assignees.map((one) => one._id));
  }, [open, ticket.assignees]);

  const options = (staff ?? []).map((profile) => ({
    value: profile._id,
    label: profile.usernameDisplayOverride || profile.username,
  }));

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await assign({ ticketId, profileIds: values as Id<"profiles">[] });
      onOpenChange(false);
    } catch (thrown) {
      setError(mutationError(thrown, "The assignees were not changed."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Assignees" description="Staff who own this ticket." width={480}>
        {error ? (
          <Alert variant="danger">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <MultiSelect
          values={values}
          onChange={setValues}
          options={options}
          placeholder={staff === undefined ? "Loading staff…" : "Choose staff"}
          searchPlaceholder="Filter staff…"
          emptyText="No staff match that."
          ariaLabel="Assignees"
        />
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} busy={busy}>
            {busy ? "Saving…" : "Update"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NotesPanel({ ticket, ticketId }: { ticket: TicketDetail; ticketId: Id<"tickets"> }) {
  const setNotes = useMutation(api.tickets.setNotes);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(ticket.notes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editing) setDraft(ticket.notes);
  }, [editing, ticket.notes]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await setNotes({ ticketId, notes: draft });
      setEditing(false);
    } catch (thrown) {
      setError(mutationError(thrown, "The notes were not saved."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title="Assignee notes"
      action={
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Edit assignee notes"
          title="Edit assignee notes"
          onClick={() => setEditing(true)}
          className="text-muted-foreground"
        >
          <Pencil aria-hidden />
        </Button>
      }
    >
      <p className={cn("whitespace-pre-wrap text-sm", ticket.notes ? "text-subtle" : "text-muted-foreground")}>
        {ticket.notes || "Nothing here."}
      </p>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent
          title="Assignee notes"
          description="Only staff and the problem's editors read these."
          width={560}
        >
          {error ? (
            <Alert variant="danger">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={6}
            aria-label="Assignee notes"
          />
          <DialogFooter>
            <Button variant="secondary" onClick={() => setEditing(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={save} busy={busy}>
              {busy ? "Saving…" : "Update"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}
