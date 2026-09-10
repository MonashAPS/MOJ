"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Badge, Button, Field, MultiSelect, Select, Textarea } from "@moj/ui";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { type AdminColumn, AdminTable } from "@/components/admin/AdminTable";
import { formatDateTime } from "@/lib/format";
import { ConfirmAction, SearchBox, StatusLine } from "../_components/console";
import { RecordDialog } from "../_components/RecordDialog";

type TicketRow = {
  _id: Id<"tickets">;
  legacyId?: number;
  title: string;
  time: number;
  isOpen: boolean;
  notes: string;
  authorName: string;
  assigneeNames: string[];
  linkedType?: string;
  linkedKey?: string;
  messageCount: number;
};

const STATE_OPTIONS = [
  { value: "open", label: "Open tickets" },
  { value: "all", label: "Every ticket" },
];

const PER_PAGE = 50;

export function TicketsTable() {
  const [state, setState] = useState("open");
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState("0");

  const page = useQuery(api.admin.tickets.list, {
    onlyOpen: state === "open",
    ...(search.trim() ? { search: search.trim() } : {}),
    cursor,
    numItems: PER_PAGE,
  });
  const counts = useQuery(api.admin.tickets.counts, {});

  const setOpen = useMutation(api.admin.tickets.setOpen);
  const remove = useMutation(api.admin.tickets.remove);

  const [assigning, setAssigning] = useState<TicketRow | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  async function run(action: () => Promise<unknown>, ok: string) {
    try {
      await action();
      setMessage({ tone: "ok", text: ok });
    } catch (caught) {
      setMessage({ tone: "bad", text: caught instanceof Error ? caught.message : "That did not work." });
    }
  }

  const columns: AdminColumn<TicketRow>[] = [
    {
      key: "title",
      header: "Ticket",
      cell: (row) => (
        <span className="grid">
          <Link
            className="font-medium text-link hover:underline"
            href={`/ticket/${row.legacyId ?? row._id}/`}
          >
            {row.title}
          </Link>
          <span className="text-sm text-muted-foreground">
            {row.linkedType === "problem" && row.linkedKey ? `on problem ${row.linkedKey}` : "site ticket"}
            {" · "}
            {row.messageCount} {row.messageCount === 1 ? "message" : "messages"}
          </span>
        </span>
      ),
    },
    { key: "author", header: "Opened by", cell: (row) => row.authorName },
    {
      key: "assignees",
      header: "Assigned to",
      cell: (row) =>
        row.assigneeNames.length === 0 ? (
          <span className="text-muted-foreground">Nobody</span>
        ) : (
          row.assigneeNames.join(", ")
        ),
    },
    {
      key: "state",
      header: "State",
      cell: (row) => (
        <Badge variant={row.isOpen ? "warn" : "good"} shape="square">
          {row.isOpen ? "Open" : "Closed"}
        </Badge>
      ),
    },
    { key: "time", header: "Opened", numeric: true, cell: (row) => formatDateTime(row.time) },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      cell: (row) => (
        <span className="flex items-center justify-end gap-1">
          <Button variant="secondary" size="sm" onClick={() => setAssigning(row)}>
            Assign
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              run(
                () =>
                  setOpen({
                    ticketId: row._id,
                    open: !row.isOpen,
                    reason: row.isOpen ? "Closed from the console" : "Reopened from the console",
                  }),
                `${row.title} has been ${row.isOpen ? "closed" : "reopened"}.`,
              )
            }
          >
            {row.isOpen ? "Close" : "Reopen"}
          </Button>
          <ConfirmAction
            trigger={
              <Button variant="ghost" size="sm">
                Delete
              </Button>
            }
            title={`Delete "${row.title}"?`}
            description={`The ticket and its ${row.messageCount} ${row.messageCount === 1 ? "message" : "messages"} are removed. Closing it instead keeps the thread.`}
            confirmLabel="Delete ticket"
            onConfirm={() =>
              run(
                () => remove({ ticketId: row._id, reason: "Deleted from the console" }),
                `${row.title} has been deleted.`,
              )
            }
          />
        </span>
      ),
    },
  ];

  const rows = page?.page as TicketRow[] | undefined;

  return (
    <div className="grid gap-3">
      {message ? <StatusLine tone={message.tone}>{message.text}</StatusLine> : null}

      <AdminTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row._id}
        toolbar={
          <>
            <SearchBox
              value={search}
              onChange={(value) => {
                setSearch(value);
                setCursor("0");
              }}
              placeholder="Ticket title"
              ariaLabel="Search tickets"
            />
            <Select
              options={STATE_OPTIONS}
              value={state}
              onValueChange={(value) => {
                setState(value);
                setCursor("0");
              }}
              ariaLabel="Ticket state"
              size="sm"
              className="w-[168px]"
            />
            <span className="ml-auto font-mono text-mono tabular-nums text-muted-foreground">
              {counts ? `${counts.open} open · ${counts.mine} mine · ${counts.total} total` : ""}
            </span>
          </>
        }
        emptyTitle={state === "open" ? "No open tickets" : "No tickets"}
        emptyDescription={
          state === "open"
            ? "Nothing is waiting on staff right now."
            : "Nobody has reported a problem with a problem yet."
        }
        emptyAction={
          state === "open" ? (
            <Button variant="secondary" onClick={() => setState("all")}>
              Show closed tickets
            </Button>
          ) : undefined
        }
        footer={
          page && !page.isDone ? (
            <>
              <span className="font-mono text-mono tabular-nums text-muted-foreground">
                Showing {rows?.length ?? 0} of {page.totalCount}
              </span>
              <Button variant="secondary" size="sm" onClick={() => setCursor(page.continueCursor)}>
                Next page
              </Button>
            </>
          ) : cursor !== "0" ? (
            <>
              <span className="font-mono text-mono tabular-nums text-muted-foreground">
                End of {page?.totalCount ?? 0} tickets
              </span>
              <Button variant="secondary" size="sm" onClick={() => setCursor("0")}>
                Back to the first page
              </Button>
            </>
          ) : null
        }
      />

      {assigning ? (
        <AssignDialog
          ticket={assigning}
          onClose={() => setAssigning(null)}
          onDone={(text) => {
            setMessage({ tone: "ok", text });
            setAssigning(null);
          }}
        />
      ) : null}
    </div>
  );
}

function AssignDialog({
  ticket,
  onClose,
  onDone,
}: {
  ticket: TicketRow;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const options = useQuery(api.admin.tickets.assigneeOptions, { ticketId: ticket._id });
  const setAssignees = useMutation(api.admin.tickets.setAssignees);
  const setNotes = useMutation(api.admin.tickets.setNotes);

  const [values, setValues] = useState<string[] | null>(null);
  const [notes, setNotesValue] = useState(ticket.notes);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen =
    values ??
    (options ?? [])
      .filter((option) => ticket.assigneeNames.includes(option.displayName))
      .map((option) => option._id as string);

  async function save() {
    if (reason.trim().length === 0) {
      setError("Give a reason for the change; it is recorded on the revision.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await setAssignees({
        ticketId: ticket._id,
        profileIds: chosen as Id<"profiles">[],
        reason,
      });
      if (notes !== ticket.notes) {
        await setNotes({ ticketId: ticket._id, notes, reason });
      }
      onDone(`${ticket.title} has been reassigned.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That ticket could not be reassigned.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <RecordDialog
      open
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={`Assign ${ticket.title}`}
      description="Assignees see the ticket in their own list and are notified when it moves."
      onSubmit={save}
      reason={reason}
      onReasonChange={setReason}
      busy={busy}
      error={error}
      submitLabel="Save assignment"
    >
      <Field label="Assignees" hint="The problem's authors and curators come first, then every staff member.">
        <MultiSelect
          options={(options ?? []).map((option) => ({
            value: option._id as string,
            label: option.displayName,
          }))}
          values={chosen}
          onChange={setValues}
          searchPlaceholder="Find a member"
          emptyText="Nobody by that name."
        />
      </Field>
      <Field
        label="Staff notes"
        optional=" (optional)"
        hint="Only staff read these; the reporter never does."
      >
        <Textarea rows={4} value={notes} onChange={(event) => setNotesValue(event.target.value)} />
      </Field>
      <p className="text-sm text-muted-foreground">
        Opened {formatDateTime(ticket.time)} by {ticket.authorName}
        {ticket.linkedKey ? ` on problem ${ticket.linkedKey}` : ""}.{" "}
        <Link className="text-link hover:underline" href={`/ticket/${ticket.legacyId ?? ticket._id}/`}>
          Open the thread
        </Link>
      </p>
    </RecordDialog>
  );
}
