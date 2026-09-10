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
import { useId, useState } from "react";
import { AdminFormError, JobProgress } from "@/components/admin";
import type { ContestEdit } from "./types";

type Action = "rate" | "rescore" | "lock" | "unlock";

/** `ContestAdmin`'s admin actions, plus the disqualify list from
 *  `ContestParticipationDisqualify`. */
export function ContestActionsTab({ contest }: { contest: ContestEdit }) {
  const router = useRouter();
  const rate = useMutation(api.admin.contests.rate);
  const rescore = useMutation(api.admin.contests.rescore);
  const setLocked = useMutation(api.admin.contests.setLocked);
  const clone = useMutation(api.contests.clone);
  const disqualify = useMutation(api.contests.disqualify);

  const cloneId = useId();
  const reasonId = useId();
  const [reason, setReason] = useState("");
  const [cloneKey, setCloneKey] = useState("");
  const [jobId, setJobId] = useState<Id<"jobs"> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Action | null>(null);

  async function guard(work: () => Promise<unknown>) {
    setError(null);
    try {
      await work();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The action was refused.");
    }
  }

  async function run(action: Action) {
    setConfirm(null);
    await guard(async () => {
      if (action === "rate") {
        const result = await rate({ key: contest.key, reason: reason.trim() || undefined });
        setJobId(result.jobId);
        toast.success("Rating queued");
      } else if (action === "rescore") {
        const result = await rescore({ key: contest.key, reason: reason.trim() || undefined });
        setJobId(result.jobId);
        toast.success("Rescore queued");
      } else {
        await setLocked({
          key: contest.key,
          lockedAfter: action === "lock" ? Date.now() : null,
          reason: reason.trim() || undefined,
        });
        toast.success(action === "lock" ? "Contest locked." : "Contest unlocked.");
      }
    });
  }

  const locked = contest.lockedAfter !== null;

  return (
    <div className="grid gap-4">
      <AdminFormError message={error} />
      {jobId ? <JobProgress jobId={jobId} title={contest.key} onDismiss={() => setJobId(null)} /> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Rating" bodyClassName="grid gap-3 p-4">
          <p className="text-sm text-muted-foreground">
            {contest.isRated
              ? "Recomputes every rating from this contest onwards, in order. Run it once the scores are final."
              : "This contest is not rated, so rating it would change nothing. Turn rating on in General first."}
          </p>
          <Button
            variant="secondary"
            className="w-fit"
            disabled={!contest.permissions.contestRating}
            title={contest.permissions.contestRating ? undefined : "You do not have judge.contest_rating."}
            onClick={() => setConfirm("rate")}
          >
            Rate this contest
          </Button>
        </Panel>

        <Panel title="Scores" bodyClassName="grid gap-3 p-4">
          <p className="text-sm text-muted-foreground">
            Recalculates every participation from the submissions already on record, using the current format
            and the current problem points. Nothing is regraded.
          </p>
          <Button variant="secondary" className="w-fit" onClick={() => setConfirm("rescore")}>
            Rescore the contest
          </Button>
        </Panel>

        <Panel title="Lock" bodyClassName="grid gap-3 p-4">
          <p className="text-sm text-muted-foreground">
            {locked
              ? "Submissions to this contest cannot be edited or rejudged."
              : "Locking freezes the contest's submissions against edits and rejudges from now on."}
          </p>
          <Button
            variant="secondary"
            className="w-fit"
            disabled={!contest.permissions.lockContest}
            title={contest.permissions.lockContest ? undefined : "You do not have judge.lock_contest."}
            onClick={() => setConfirm(locked ? "unlock" : "lock")}
          >
            {locked ? "Unlock the contest" : "Lock the contest"}
          </Button>
        </Panel>

        <Panel title="Clone" bodyClassName="grid gap-3 p-4">
          <p className="text-sm text-muted-foreground">
            Copies the settings and the problem list under a new id. The copy is hidden, has you as its only
            author, and starts with no participants.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="New contest id" htmlFor={cloneId} className="w-[200px]">
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
                    : "Give the copy an id first."
                  : "You do not have judge.clone_contest."
              }
              onClick={() =>
                guard(async () => {
                  const result = await clone({ key: contest.key, newKey: cloneKey.trim() });
                  router.push(`/admin/contests/${result.key}/`);
                })
              }
            >
              Clone contest
            </Button>
          </div>
        </Panel>
      </div>

      <Panel title={`Contestants (${contest.contestants.length})`} bodyClassName="p-0">
        {contest.contestants.length === 0 ? (
          <EmptyState
            className="m-3"
            icon={<Users aria-hidden />}
            title="Nobody has entered yet"
            description="Live participations appear here once members join the contest."
          />
        ) : (
          <Table dense className="group/table" scrollable={false}>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead numeric>Score</TableHead>
                <TableHead numeric>Penalty</TableHead>
                <TableHead>State</TableHead>
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
                    <Badge variant={row.isDisqualified ? "bad" : "neutral"} shape="square">
                      {row.isDisqualified ? "Disqualified" : "Competing"}
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
                            participationId: row.participationId as Id<"contestParticipations">,
                            disqualified: !row.isDisqualified,
                          });
                          toast.success(
                            row.isDisqualified
                              ? `${row.username} was reinstated.`
                              : `${row.username} was disqualified.`,
                          );
                        })
                      }
                    >
                      {row.isDisqualified ? "Reinstate" : "Disqualify"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      <Panel title="History" bodyClassName="p-4">
        <Field
          label="Reason for change"
          htmlFor={reasonId}
          hint="Kept with the revision every action above writes."
        >
          <Input
            id={reasonId}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Describe the change"
          />
        </Field>
      </Panel>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "rate"
                ? `Rate ${contest.name}?`
                : confirm === "rescore"
                  ? `Rescore ${contest.name}?`
                  : confirm === "lock"
                    ? `Lock ${contest.name}?`
                    : `Unlock ${contest.name}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "rate"
                ? `Every rating from this contest onwards is recomputed. ${contest.contestants.length} participations are involved.`
                : confirm === "rescore"
                  ? `All ${contest.contestants.length} participations are recalculated from their submissions.`
                  : confirm === "lock"
                    ? "Submissions to this contest stop being editable and rejudgeable from now on."
                    : "Submissions to this contest become editable and rejudgeable again."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirm && run(confirm)}>
              {confirm === "rate"
                ? "Rate"
                : confirm === "rescore"
                  ? "Rescore"
                  : confirm === "lock"
                    ? "Lock"
                    : "Unlock"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
