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
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Field,
  FieldGroup,
  Input,
  Textarea,
  Tooltip,
} from "@moj/ui";
import { useMutation, useQuery } from "convex/react";
import { MoreHorizontal, Plus } from "lucide-react";
import { useState } from "react";
import { type AdminColumn, AdminTable } from "@/components/admin/AdminTable";
import { formatRelative } from "@/lib/format";
import { CopyButton, DASH, Flags, StatusLine } from "../_components/console";
import { RecordDialog } from "../_components/RecordDialog";

type JudgeRow = {
  _id: Id<"judges">;
  name: string;
  online: boolean;
  tier: number;
  isBlocked: boolean;
  isDisabled: boolean;
  description: string;
  lastIp: string | null;
  lastSeen: number | null;
  ping: number | null;
  load: number | null;
  problemCount: number;
  runtimeCount: number;
  disconnectRequestedAt: number | null;
};

type Draft = { id: Id<"judges"> | null; name: string; tier: string; description: string };

const EMPTY: Draft = { id: null, name: "", tier: "1", description: "" };

export function JudgesTable({ siteUrl }: { siteUrl: string }) {
  const judges = useQuery(api.admin.judges.list, {}) as JudgeRow[] | undefined;
  const create = useMutation(api.admin.judges.create);
  const update = useMutation(api.admin.judges.update);
  const toggleDisabled = useMutation(api.admin.judges.toggleDisabled);
  const disconnect = useMutation(api.admin.judges.disconnect);
  const regenerate = useMutation(api.admin.judges.regenerateKey);
  const remove = useMutation(api.admin.judges.remove);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [issued, setIssued] = useState<{ name: string; key: string } | null>(null);
  const [pending, setPending] = useState<{ kind: "disconnect" | "key" | "delete"; row: JudgeRow } | null>(
    null,
  );

  function open(row?: JudgeRow) {
    setDraft(
      row ? { id: row._id, name: row.name, tier: String(row.tier), description: row.description } : EMPTY,
    );
    setReason("");
    setError(null);
  }

  async function save() {
    if (!draft) return;
    if (reason.trim().length === 0) {
      setError("Give a reason for the change; it is recorded on the revision.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (draft.id) {
        await update({
          id: draft.id,
          name: draft.name,
          tier: Number(draft.tier),
          description: draft.description,
          reason,
        });
        setMessage({ tone: "ok", text: `${draft.name} has been updated.` });
      } else {
        const result = await create({
          name: draft.name,
          tier: Number(draft.tier),
          description: draft.description,
          reason,
        });
        setIssued({ name: result.name, key: result.authKey });
      }
      setDraft(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That judge could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function run(action: () => Promise<unknown>, ok: string) {
    try {
      await action();
      setMessage({ tone: "ok", text: ok });
    } catch (caught) {
      setMessage({
        tone: "bad",
        text: caught instanceof Error ? caught.message : "That did not work.",
      });
    }
  }

  async function confirmPending() {
    if (!pending) return;
    const { kind, row } = pending;
    setPending(null);
    if (kind === "disconnect") {
      await run(() => disconnect({ id: row._id }), `${row.name} will disconnect on its next heartbeat.`);
      return;
    }
    if (kind === "delete") {
      await run(
        () => remove({ id: row._id, reason: "Deleted from the console" }),
        `${row.name} has been deleted.`,
      );
      return;
    }
    try {
      const result = await regenerate({ id: row._id, reason: "Regenerated from the console" });
      setIssued({ name: row.name, key: result.authKey });
    } catch (caught) {
      setMessage({
        tone: "bad",
        text: caught instanceof Error ? caught.message : "The key could not be issued.",
      });
    }
  }

  const columns: AdminColumn<JudgeRow>[] = [
    {
      key: "name",
      header: "Judge",
      cell: (row) => (
        <span className="grid">
          <span className="font-mono text-mono font-medium text-foreground">{row.name}</span>
          {row.description ? (
            <span className="truncate text-sm text-muted-foreground">{row.description}</span>
          ) : null}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => (
        <Flags
          flags={[
            { on: row.online, label: "Online", tone: "good" },
            { on: !row.online, label: "Offline", tone: "warn" },
            { on: row.isDisabled, label: "Disabled", tone: "bad" },
            { on: row.isBlocked, label: "Blocked", tone: "bad" },
            { on: row.disconnectRequestedAt !== null, label: "Disconnecting", tone: "warn" },
          ]}
        />
      ),
    },
    { key: "tier", header: "Tier", numeric: true, cell: (row) => row.tier },
    {
      key: "ping",
      header: "Ping",
      numeric: true,
      cell: (row) => (row.ping === null ? DASH : `${(row.ping * 1000).toFixed(1)} ms`),
    },
    {
      key: "load",
      header: "Load",
      numeric: true,
      cell: (row) => (row.load === null ? DASH : row.load.toFixed(2)),
    },
    { key: "problems", header: "Problems", numeric: true, cell: (row) => row.problemCount.toLocaleString() },
    { key: "runtimes", header: "Runtimes", numeric: true, cell: (row) => row.runtimeCount },
    {
      key: "lastSeen",
      header: "Last seen",
      numeric: true,
      cell: (row) => (row.lastSeen === null ? DASH : formatRelative(row.lastSeen)),
    },
    {
      key: "ip",
      header: "Address",
      cell: (row) => <span className="font-mono text-mono">{row.lastIp ?? DASH}</span>,
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      cell: (row) => (
        <span className="flex items-center justify-end gap-1">
          <Button variant="secondary" size="sm" onClick={() => open(row)}>
            Edit
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Tooltip content="More actions">
                <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${row.name}`}>
                  <MoreHorizontal aria-hidden />
                </Button>
              </Tooltip>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() =>
                  run(
                    () => toggleDisabled({ id: row._id, reason: "Toggled from the console" }),
                    `${row.name} has been ${row.isDisabled ? "enabled" : "disabled"}.`,
                  )
                }
              >
                {row.isDisabled ? "Enable" : "Disable"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  run(
                    () =>
                      update({
                        id: row._id,
                        isBlocked: !row.isBlocked,
                        reason: "Toggled block from the console",
                      }),
                    `${row.name} has been ${row.isBlocked ? "unblocked" : "blocked"}.`,
                  )
                }
              >
                {row.isBlocked ? "Unblock" : "Block"}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!row.online}
                title={row.online ? undefined : "That judge is not connected."}
                onSelect={() => setPending({ kind: "disconnect", row })}
              >
                Disconnect
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setPending({ kind: "key", row })}>
                Issue a new key
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={() => setPending({ kind: "delete", row })}>
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      ),
    },
  ];

  return (
    <div className="grid gap-3">
      {message ? <StatusLine tone={message.tone}>{message.text}</StatusLine> : null}

      <AdminTable
        columns={columns}
        rows={judges}
        rowKey={(row) => row._id}
        toolbar={
          <>
            <span className="text-sm text-muted-foreground">
              {judges ? `${judges.filter((row) => row.online).length} of ${judges.length} online` : ""}
            </span>
            <Button className="ml-auto" size="sm" icon={<Plus aria-hidden />} onClick={() => open()}>
              New judge
            </Button>
          </>
        }
        emptyTitle="No judges"
        emptyDescription="Nothing is registered to grade submissions yet."
        emptyAction={
          <Button variant="secondary" onClick={() => open()}>
            New judge
          </Button>
        }
      />

      <RecordDialog
        open={draft !== null}
        onOpenChange={(next) => (next ? undefined : setDraft(null))}
        title={draft?.id ? `Edit ${draft.name}` : "New judge"}
        description={
          draft?.id
            ? "The key is not shown again. Issue a new one from the row if it has been lost."
            : "The key is generated here and shown once."
        }
        onSubmit={save}
        reason={reason}
        onReasonChange={setReason}
        busy={busy}
        error={error}
        submitLabel={draft?.id ? "Save judge" : "Create judge"}
      >
        <FieldGroup columns={2}>
          <Field label="Name" hint="What the judge presents at the handshake.">
            <Input
              mono
              value={draft?.name ?? ""}
              maxLength={50}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, name: event.target.value } : current))
              }
              placeholder="judge2"
            />
          </Field>
          <Field label="Tier" hint="Lower tiers are handed work first.">
            <Input
              type="number"
              mono
              min={0}
              value={draft?.tier ?? "1"}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, tier: event.target.value } : current))
              }
            />
          </Field>
        </FieldGroup>
        <Field label="Description" optional=" (optional)" hint="Where the machine lives, who runs it.">
          <Textarea
            rows={3}
            value={draft?.description ?? ""}
            onChange={(event) =>
              setDraft((current) => (current ? { ...current, description: event.target.value } : current))
            }
          />
        </Field>
      </RecordDialog>

      <AlertDialog open={pending !== null} onOpenChange={(next) => (next ? undefined : setPending(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.kind === "disconnect"
                ? `Disconnect ${pending.row.name}?`
                : pending?.kind === "key"
                  ? `Issue a new key for ${pending.row.name}?`
                  : `Delete ${pending?.row.name ?? ""}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.kind === "disconnect"
                ? "The judge drops its session on its next heartbeat and anything it is grading is requeued."
                : pending?.kind === "key"
                  ? "The current key stops working immediately. The judge cannot reconnect until it is restarted with the new one."
                  : pending
                    ? `${pending.row.name} and its ${pending.row.runtimeCount} recorded runtimes are removed. Submissions it graded keep their results.`
                    : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="secondary" type="button">
                Cancel
              </Button>
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void confirmPending();
              }}
            >
              {pending?.kind === "disconnect"
                ? "Disconnect"
                : pending?.kind === "key"
                  ? "Issue a new key"
                  : "Delete judge"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={issued !== null} onOpenChange={(next) => (next ? undefined : setIssued(null))}>
        <DialogContent
          title={`Key for ${issued?.name ?? ""}`}
          description="This is the only time the key is shown. Copy it now; only its hash is stored."
          width={720}
        >
          <div className="grid gap-3">
            <div className="grid gap-2">
              <span className="font-sans text-xs font-semibold uppercase tracking-label text-muted-foreground">
                Key
              </span>
              <div className="flex items-start gap-2">
                <code className="min-w-0 flex-1 break-all rounded-md bg-code p-3 font-mono text-mono">
                  {issued?.key}
                </code>
                <CopyButton value={issued?.key ?? ""} label="Copy key" />
              </div>
            </div>
            <div className="grid gap-2">
              <span className="font-sans text-xs font-semibold uppercase tracking-label text-muted-foreground">
                Start this judge
              </span>
              <div className="flex items-start gap-2">
                <pre className="min-w-0 flex-1 overflow-x-auto rounded-md bg-code p-3 font-mono text-mono">
                  {dockerCommand(siteUrl, issued?.name ?? "", issued?.key ?? "")}
                </pre>
                <CopyButton
                  value={dockerCommand(siteUrl, issued?.name ?? "", issued?.key ?? "")}
                  label="Copy command"
                />
              </div>
              <p className="text-sm text-muted-foreground">
                The container needs the problem tree mounted at <code className="font-mono">/problems</code>{" "}
                and outbound HTTPS to this site. Nothing has to listen.
              </p>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Done</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function dockerCommand(siteUrl: string, name: string, key: string): string {
  return [
    "docker run -d --restart unless-stopped --name moj-judge \\",
    "  --cap-add SYS_PTRACE \\",
    "  -v /srv/moj/problems:/problems \\",
    `  -e MOJ_URL=${siteUrl} \\`,
    `  -e JUDGE_NAME=${name} \\`,
    `  -e JUDGE_KEY=${key} \\`,
    "  moj-judge:tier1",
  ].join("\n");
}
