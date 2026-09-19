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
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Panel,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from "@moj/ui";
import { useMutation } from "convex/react";
import { Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { AdminFormError, JobProgress } from "@/components/admin";
import type { ContestEdit } from "./types";

type Action = "rate" | "rescore" | "lock" | "unlock";

/** `ContestAdmin`'s admin actions, plus the disqualify list from
 *  `ContestParticipationDisqualify`. */
export function ContestActionsTab({ contest }: { contest: ContestEdit }) {
  const t = useTranslations("admin.contests.actions");
  const actions = useTranslations("common.actions");
  const router = useRouter();
  const rate = useMutation(api.admin.contests.rate);
  const rescore = useMutation(api.admin.contests.rescore);
  const setLocked = useMutation(api.admin.contests.setLocked);
  const clone = useMutation(api.contests.tools.clone);
  const disqualify = useMutation(api.contests.participation.disqualify);

  const cloneId = useId();
  const reasonId = useId();
  const [reason, setReason] = useState("");
  const [cloneKey, setCloneKey] = useState("");
  const [jobId, setJobId] = useState<Id<"jobs"> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Action | null>(null);

  async function guard<T>(work: () => Promise<T>) {
    setError(null);

    try {
      await work();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("refused"));
    }
  }

  async function run(action: Action) {
    setConfirm(null);
    await guard(async () => {
      if (action === "rate") {
        const result = await rate({ key: contest.key, reason: reason.trim() || undefined });
        setJobId(result.jobId);
        toast.success(t("rateQueued"));
      } else if (action === "rescore") {
        const result = await rescore({ key: contest.key, reason: reason.trim() || undefined });
        setJobId(result.jobId);
        toast.success(t("rescoreQueued"));
      } else {
        await setLocked({
          key: contest.key,
          lockedAfter: action === "lock" ? Date.now() : null,
          reason: reason.trim() || undefined,
        });
        toast.success(action === "lock" ? t("lockedToast") : t("unlockedToast"));
      }
    });
  }

  const locked = contest.lockedAfter !== null;

  return (
    <div className="grid gap-4">
      <AdminFormError message={error} />
      {jobId ? <JobProgress jobId={jobId} title={contest.key} onDismiss={() => setJobId(null)} /> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t("ratingTitle")} bodyClassName="grid gap-3 p-4">
          <p className="text-sm text-muted-foreground">
            {contest.rating !== null ? t("ratingRated") : t("ratingNotRated")}
          </p>
          <Button
            variant="secondary"
            className="w-fit"
            disabled={!contest.permissions.contestRating}
            title={
              contest.permissions.contestRating
                ? undefined
                : t("missingPermission", { permission: "judge.contest_rating" })
            }
            onClick={() => setConfirm("rate")}
          >
            {t("rateButton")}
          </Button>
        </Panel>

        <Panel title={t("scoresTitle")} bodyClassName="grid gap-3 p-4">
          <p className="text-sm text-muted-foreground">{t("scoresBody")}</p>
          <Button variant="secondary" className="w-fit" onClick={() => setConfirm("rescore")}>
            {t("rescoreButton")}
          </Button>
        </Panel>

        <Panel title={t("lockTitle")} bodyClassName="grid gap-3 p-4">
          <p className="text-sm text-muted-foreground">{locked ? t("lockLocked") : t("lockUnlocked")}</p>
          <Button
            variant="secondary"
            className="w-fit"
            disabled={!contest.permissions.lockContest}
            title={
              contest.permissions.lockContest
                ? undefined
                : t("missingPermission", { permission: "judge.lock_contest" })
            }
            onClick={() => setConfirm(locked ? "unlock" : "lock")}
          >
            {locked ? t("unlockButton") : t("lockButton")}
          </Button>
        </Panel>

        <Panel title={t("cloneTitle")} bodyClassName="grid gap-3 p-4">
          <p className="text-sm text-muted-foreground">{t("cloneBody")}</p>
          <div className="flex flex-wrap items-end gap-3">
            <Field label={t("cloneKey")} htmlFor={cloneId} className="w-[200px]">
              <Input
                id={cloneId}
                mono
                maxLength={20}
                value={cloneKey}
                onChange={(event) => setCloneKey(event.target.value.toLowerCase())}
                placeholder={`${contest.key}b`}
              />
            </Field>
            <Button
              variant="secondary"
              disabled={!contest.permissions.cloneContest || !cloneKey.trim()}
              title={
                contest.permissions.cloneContest
                  ? cloneKey.trim()
                    ? undefined
                    : t("cloneKeyMissing")
                  : t("missingPermission", { permission: "judge.clone_contest" })
              }
              onClick={() =>
                guard(async () => {
                  const result = await clone({ key: contest.key, newKey: cloneKey.trim() });
                  router.push(`/admin/contests/${result.key}/`);
                })
              }
            >
              {t("cloneButton")}
            </Button>
          </div>
        </Panel>
      </div>

      <Panel title={t("contestantsTitle", { count: contest.contestants.length })} bodyClassName="p-0">
        {contest.contestants.length === 0 ? (
          <EmptyState
            className="m-3"
            icon={<Users aria-hidden />}
            title={t("contestantsEmptyTitle")}
            description={t("contestantsEmptyDescription")}
          />
        ) : (
          <Table dense className="group/table" scrollable={false}>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columnUser")}</TableHead>
                <TableHead numeric>{t("columnScore")}</TableHead>
                <TableHead numeric>{t("columnPenalty")}</TableHead>
                <TableHead>{t("columnState")}</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {contest.contestants.map((row) => (
                <TableRow key={row.participationId}>
                  <TableCell className="font-mono text-mono">{row.username}</TableCell>
                  <TableCell numeric>{row.score}</TableCell>
                  <TableCell numeric>{row.cumtime}</TableCell>
                  <TableCell>
                    <Badge variant={row.isDisqualified ? "bad" : "neutral"} rounding="square">
                      {row.isDisqualified ? t("disqualified") : t("competing")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        guard(async () => {
                          await disqualify({
                            key: contest.key,
                            participationId: row.participationId,
                            disqualified: !row.isDisqualified,
                          });
                          toast.success(
                            row.isDisqualified
                              ? t("reinstatedToast", { username: row.username })
                              : t("disqualifiedToast", { username: row.username }),
                          );
                        })
                      }
                    >
                      {row.isDisqualified ? t("reinstate") : t("disqualify")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      <Panel title={t("historyTitle")} bodyClassName="p-4">
        <Field label={t("reason")} htmlFor={reasonId} hint={t("reasonHint")}>
          <Input
            id={reasonId}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t("reasonPlaceholder")}
          />
        </Field>
      </Panel>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm ? t(`confirm.${confirm}.title`, { name: contest.name }) : null}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm ? t(`confirm.${confirm}.body`, { count: contest.contestants.length }) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{actions("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirm && run(confirm)}>
              {confirm ? t(`confirm.${confirm}.action`) : null}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
