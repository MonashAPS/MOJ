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
import { useTranslations } from "next-intl";
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
  const t = useTranslations("admin.judges");
  const actions = useTranslations("common.actions");
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
        setMessage({ tone: "ok", text: t("updated", { name: draft.name }) });
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
      setError(caught instanceof Error ? caught.message : t("saveFailed"));
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
        text: caught instanceof Error ? caught.message : t("actionFailed"),
      });
    }
  }

  async function confirmPending() {
    if (!pending) return;
    const { kind, row } = pending;
    setPending(null);
    if (kind === "disconnect") {
      await run(() => disconnect({ id: row._id }), t("disconnectingMessage", { name: row.name }));
      return;
    }
    if (kind === "delete") {
      await run(
        () => remove({ id: row._id, reason: "Deleted from the console" }),
        t("deletedMessage", { name: row.name }),
      );
      return;
    }
    try {
      const result = await regenerate({ id: row._id, reason: "Regenerated from the console" });
      setIssued({ name: row.name, key: result.authKey });
    } catch (caught) {
      setMessage({
        tone: "bad",
        text: caught instanceof Error ? caught.message : t("keyFailed"),
      });
    }
  }

  const columns: AdminColumn<JudgeRow>[] = [
    {
      key: "name",
      header: t("columnJudge"),
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
      header: t("columnStatus"),
      cell: (row) => (
        <Flags
          flags={[
            { on: row.online, label: t("statusOnline"), tone: "good" },
            { on: !row.online, label: t("statusOffline"), tone: "warn" },
            { on: row.isDisabled, label: t("statusDisabled"), tone: "bad" },
            { on: row.isBlocked, label: t("statusBlocked"), tone: "bad" },
            { on: row.disconnectRequestedAt !== null, label: t("statusDisconnecting"), tone: "warn" },
          ]}
        />
      ),
    },
    { key: "tier", header: t("columnTier"), numeric: true, cell: (row) => row.tier },
    {
      key: "ping",
      header: t("columnPing"),
      numeric: true,
      cell: (row) => (row.ping === null ? DASH : t("pingValue", { value: (row.ping * 1000).toFixed(1) })),
    },
    {
      key: "load",
      header: t("columnLoad"),
      numeric: true,
      cell: (row) => (row.load === null ? DASH : row.load.toFixed(2)),
    },
    {
      key: "problems",
      header: t("columnProblems"),
      numeric: true,
      cell: (row) => row.problemCount.toLocaleString(),
    },
    { key: "runtimes", header: t("columnRuntimes"), numeric: true, cell: (row) => row.runtimeCount },
    {
      key: "lastSeen",
      header: t("columnLastSeen"),
      numeric: true,
      cell: (row) => (row.lastSeen === null ? DASH : formatRelative(row.lastSeen)),
    },
    {
      key: "ip",
      header: t("columnAddress"),
      cell: (row) => <span className="font-mono text-mono">{row.lastIp ?? DASH}</span>,
    },
    {
      key: "actions",
      header: <span className="sr-only">{t("columnActions")}</span>,
      cell: (row) => (
        <span className="flex items-center justify-end gap-1">
          <Button variant="secondary" size="sm" onClick={() => open(row)}>
            {actions("edit")}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Tooltip content={t("moreActions")}>
                <Button variant="ghost" size="icon-sm" aria-label={t("moreActionsFor", { name: row.name })}>
                  <MoreHorizontal aria-hidden />
                </Button>
              </Tooltip>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() =>
                  run(
                    () => toggleDisabled({ id: row._id, reason: "Toggled from the console" }),
                    row.isDisabled
                      ? t("enabledMessage", { name: row.name })
                      : t("disabledMessage", { name: row.name }),
                  )
                }
              >
                {row.isDisabled ? t("enable") : t("disable")}
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
                    row.isBlocked
                      ? t("unblockedMessage", { name: row.name })
                      : t("blockedMessage", { name: row.name }),
                  )
                }
              >
                {row.isBlocked ? t("unblock") : t("block")}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!row.online}
                title={row.online ? undefined : t("notConnected")}
                onSelect={() => setPending({ kind: "disconnect", row })}
              >
                {t("disconnect")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setPending({ kind: "key", row })}>
                {t("issueKey")}
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={() => setPending({ kind: "delete", row })}>
                {actions("delete")}
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
              {judges
                ? t("onlineCount", {
                    online: judges.filter((row) => row.online).length,
                    total: judges.length,
                  })
                : ""}
            </span>
            <Button className="ml-auto" size="sm" icon={<Plus aria-hidden />} onClick={() => open()}>
              {t("newJudge")}
            </Button>
          </>
        }
        emptyTitle={t("emptyTitle")}
        emptyDescription={t("emptyDescription")}
        emptyAction={
          <Button variant="secondary" onClick={() => open()}>
            {t("newJudge")}
          </Button>
        }
      />

      <RecordDialog
        open={draft !== null}
        onOpenChange={(next) => (next ? undefined : setDraft(null))}
        title={draft?.id ? t("editTitle", { name: draft.name }) : t("newTitle")}
        description={draft?.id ? t("editDescription") : t("newDescription")}
        onSubmit={save}
        busy={busy}
        error={error}
        submitLabel={draft?.id ? t("saveSubmit") : t("createSubmit")}
      >
        <FieldGroup columns={2}>
          <Field label={t("name")} hint={t("nameHint")}>
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
          <Field label={t("tier")} hint={t("tierHint")}>
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
        <Field label={t("description")} optional={t("optional")} hint={t("descriptionHint")}>
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
                ? t("disconnectTitle", { name: pending.row.name })
                : pending?.kind === "key"
                  ? t("issueKeyTitle", { name: pending.row.name })
                  : t("deleteTitle", { name: pending?.row.name ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.kind === "disconnect"
                ? t("disconnectDescription")
                : pending?.kind === "key"
                  ? t("issueKeyDescription")
                  : pending
                    ? t("deleteDescription", {
                        name: pending.row.name,
                        count: pending.row.runtimeCount,
                      })
                    : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="secondary" type="button">
                {actions("cancel")}
              </Button>
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void confirmPending();
              }}
            >
              {pending?.kind === "disconnect"
                ? t("disconnect")
                : pending?.kind === "key"
                  ? t("issueKey")
                  : t("deleteConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={issued !== null} onOpenChange={(next) => (next ? undefined : setIssued(null))}>
        <DialogContent
          title={t("keyTitle", { name: issued?.name ?? "" })}
          description={t("keyDescription")}
          width={720}
        >
          <div className="grid gap-3">
            <div className="grid gap-2">
              <span className="font-sans text-xs font-semibold uppercase tracking-label text-muted-foreground">
                {t("keyLabel")}
              </span>
              <div className="flex items-start gap-2">
                <code className="min-w-0 flex-1 break-all rounded-md bg-code p-3 font-mono text-mono">
                  {issued?.key}
                </code>
                <CopyButton value={issued?.key ?? ""} label={t("copyKey")} />
              </div>
            </div>
            <div className="grid gap-2">
              <span className="font-sans text-xs font-semibold uppercase tracking-label text-muted-foreground">
                {t("startJudge")}
              </span>
              <div className="flex items-start gap-2">
                <pre className="min-w-0 flex-1 overflow-x-auto rounded-md bg-code p-3 font-mono text-mono">
                  {dockerCommand(siteUrl, issued?.name ?? "", issued?.key ?? "")}
                </pre>
                <CopyButton
                  value={dockerCommand(siteUrl, issued?.name ?? "", issued?.key ?? "")}
                  label={t("copyCommand")}
                />
              </div>
              <p className="text-sm text-muted-foreground">
                {t.rich("dockerHint", {
                  code: (chunks) => <code className="font-mono">{chunks}</code>,
                })}
              </p>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">{t("done")}</Button>
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
