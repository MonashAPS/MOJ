"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Badge, Button, Field, MultiSelect, Select, Textarea } from "@moj/ui";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { type AdminColumn, AdminTable } from "@/components/admin/AdminTable";
import { ConfirmAction, SearchBox, StatusLine } from "@/components/admin/console";
import { RecordDialog } from "@/components/admin/RecordDialog";
import { formatDateTime } from "@/lib/format";

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
  { value: "open", labelKey: "stateOpen" },
  { value: "all", labelKey: "stateAll" },
];

const PER_PAGE = 50;

export function TicketsTable() {
  const t = useTranslations("admin.tickets");
  const actions = useTranslations("common.actions");
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
      setMessage({ tone: "bad", text: caught instanceof Error ? caught.message : t("actionFailed") });
    }
  }

  const columns: AdminColumn<TicketRow>[] = [
    {
      key: "title",
      header: t("columnTicket"),
      cell: (row) => (
        <span className="grid">
          <Link
            className="font-medium text-link hover:underline"
            href={`/ticket/${row.legacyId ?? row._id}/`}
          >
            {row.title}
          </Link>
          <span className="text-sm text-muted-foreground">
            {row.linkedType === "problem" && row.linkedKey
              ? t("onProblem", { code: row.linkedKey })
              : t("siteTicket")}
            {" · "}
            {t("messageCount", { count: row.messageCount })}
          </span>
        </span>
      ),
    },
    { key: "author", header: t("columnAuthor"), cell: (row) => row.authorName },
    {
      key: "assignees",
      header: t("columnAssignees"),
      cell: (row) =>
        row.assigneeNames.length === 0 ? (
          <span className="text-muted-foreground">{t("nobody")}</span>
        ) : (
          row.assigneeNames.join(", ")
        ),
    },
    {
      key: "state",
      header: t("columnState"),
      cell: (row) => (
        <Badge variant={row.isOpen ? "warn" : "good"} shape="square">
          {row.isOpen ? t("badgeOpen") : t("badgeClosed")}
        </Badge>
      ),
    },
    { key: "time", header: t("columnOpened"), numeric: true, cell: (row) => formatDateTime(row.time) },
    {
      key: "actions",
      header: <span className="sr-only">{t("columnActions")}</span>,
      cell: (row) => (
        <span className="flex items-center justify-end gap-1">
          <Button variant="secondary" size="sm" onClick={() => setAssigning(row)}>
            {t("assign")}
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
                row.isOpen
                  ? t("closedMessage", { title: row.title })
                  : t("reopenedMessage", { title: row.title }),
              )
            }
          >
            {row.isOpen ? t("close") : t("reopen")}
          </Button>
          <ConfirmAction
            trigger={
              <Button variant="ghost" size="sm">
                {actions("delete")}
              </Button>
            }
            title={t("deleteTitle", { title: row.title })}
            description={t("deleteDescription", { count: row.messageCount })}
            confirmLabel={t("deleteConfirm")}
            onConfirm={() =>
              run(
                () => remove({ ticketId: row._id, reason: "Deleted from the console" }),
                t("deletedMessage", { title: row.title }),
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
              placeholder={t("searchPlaceholder")}
              ariaLabel={t("searchLabel")}
            />
            <Select
              options={STATE_OPTIONS.map((option) => ({
                value: option.value,
                label: t(option.labelKey),
              }))}
              value={state}
              onValueChange={(value) => {
                setState(value);
                setCursor("0");
              }}
              ariaLabel={t("stateLabel")}
              size="sm"
              className="w-[168px]"
            />
            <span className="ml-auto font-mono text-mono tabular-nums text-muted-foreground">
              {counts ? t("counts", { open: counts.open, mine: counts.mine, total: counts.total }) : ""}
            </span>
          </>
        }
        emptyTitle={state === "open" ? t("emptyOpenTitle") : t("emptyTitle")}
        emptyDescription={state === "open" ? t("emptyOpenDescription") : t("emptyDescription")}
        emptyAction={
          state === "open" ? (
            <Button variant="secondary" onClick={() => setState("all")}>
              {t("showClosed")}
            </Button>
          ) : undefined
        }
        footer={
          page && !page.isDone ? (
            <>
              <span className="font-mono text-mono tabular-nums text-muted-foreground">
                {t("showing", { shown: rows?.length ?? 0, total: page.totalCount })}
              </span>
              <Button variant="secondary" size="sm" onClick={() => setCursor(page.continueCursor)}>
                {t("nextPage")}
              </Button>
            </>
          ) : cursor !== "0" ? (
            <>
              <span className="font-mono text-mono tabular-nums text-muted-foreground">
                {t("endOfList", { total: page?.totalCount ?? 0 })}
              </span>
              <Button variant="secondary" size="sm" onClick={() => setCursor("0")}>
                {t("backToFirst")}
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
  const t = useTranslations("admin.tickets");
  const options = useQuery(api.admin.tickets.assigneeOptions, { ticketId: ticket._id });
  const setAssignees = useMutation(api.admin.tickets.setAssignees);
  const setNotes = useMutation(api.admin.tickets.setNotes);

  const [values, setValues] = useState<string[] | null>(null);
  const [notes, setNotesValue] = useState(ticket.notes);
  const [reason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen =
    values ??
    (options ?? [])
      .filter((option) => ticket.assigneeNames.includes(option.displayName))
      .map((option) => option._id as string);

  async function save() {
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
      onDone(t("reassignedMessage", { title: ticket.title }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("reassignFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <RecordDialog
      open
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={t("assignTitle", { title: ticket.title })}
      description={t("assignDescription")}
      onSubmit={save}
      busy={busy}
      error={error}
      submitLabel={t("assignSubmit")}
    >
      <Field label={t("assignees")} hint={t("assigneesHint")}>
        <MultiSelect
          options={(options ?? []).map((option) => ({
            value: option._id as string,
            label: option.displayName,
          }))}
          values={chosen}
          onChange={setValues}
          searchPlaceholder={t("findMember")}
          emptyText={t("noMemberMatch")}
        />
      </Field>
      <Field label={t("notes")} optional={t("optional")} hint={t("notesHint")}>
        <Textarea rows={4} value={notes} onChange={(event) => setNotesValue(event.target.value)} />
      </Field>
      <p className="text-sm text-muted-foreground">
        {ticket.linkedKey
          ? t("openedOnProblem", {
              when: formatDateTime(ticket.time),
              author: ticket.authorName,
              code: ticket.linkedKey,
            })
          : t("opened", { when: formatDateTime(ticket.time), author: ticket.authorName })}{" "}
        <Link className="text-link hover:underline" href={`/ticket/${ticket.legacyId ?? ticket._id}/`}>
          {t("openThread")}
        </Link>
      </p>
    </RecordDialog>
  );
}
