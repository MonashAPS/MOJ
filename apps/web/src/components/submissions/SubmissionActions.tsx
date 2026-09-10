"use client";

import { api } from "@convex/_generated/api";
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
  toast,
} from "@moj/ui";
import { useMutation, useQuery } from "convex/react";
import { RefreshCw, Square } from "lucide-react";
import { useState } from "react";
import { isGrading } from "@/lib/submissionFormat";

/**
 * The status page's staff and owner actions. Abort only exists while the judge
 * still holds the submission, so it is driven off the live status rather than
 * the server's first read; both open an AlertDialog, as every irreversible
 * action does.
 */
export function SubmissionActions({
  submissionId,
  initialStatus,
  canAbort,
  canRejudge,
  isLocked,
}: {
  submissionId: number | string;
  initialStatus: string;
  canAbort: boolean;
  canRejudge: boolean;
  isLocked: boolean;
}) {
  const live = useQuery(api.submissions.detail, { submissionId: String(submissionId) });
  const status = live?.submission.status ?? initialStatus;
  const grading = isGrading(status);

  const rejudge = useMutation(api.submissions.rejudge);
  const abort = useMutation(api.submissions.abort);
  const [open, setOpen] = useState<"abort" | "rejudge" | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    const kind = open;
    if (!kind) return;
    setOpen(null);
    setBusy(true);
    try {
      if (kind === "rejudge") {
        await rejudge({ submissionId });
        toast.success(`Submission ${submissionId} queued for rejudging.`);
      } else {
        const outcome = await abort({ submissionId });
        toast.success(
          outcome.pending
            ? `Asked the judge to stop submission ${submissionId}.`
            : `Submission ${submissionId} aborted.`,
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  }

  if (!canAbort && !canRejudge) return null;

  return (
    <>
      {canAbort && grading ? (
        <Button
          variant="secondary"
          size="sm"
          busy={busy}
          onClick={() => setOpen("abort")}
          icon={<Square aria-hidden />}
        >
          Abort
        </Button>
      ) : null}
      {canRejudge && !grading ? (
        <Button
          variant="secondary"
          size="sm"
          busy={busy}
          disabled={isLocked}
          title={isLocked ? "This submission has been locked, and cannot be rejudged." : undefined}
          onClick={() => setOpen("rejudge")}
          icon={<RefreshCw aria-hidden />}
        >
          Rejudge
        </Button>
      ) : null}

      <AlertDialog open={open !== null} onOpenChange={(next) => !next && setOpen(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {open === "abort" ? `Abort submission ${submissionId}?` : `Rejudge submission ${submissionId}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {open === "abort"
                ? "Judging stops where it is and the submission is marked aborted. It keeps no score."
                : "The submission goes back into the queue and its verdict, points and case results are replaced."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={run}>{open === "abort" ? "Abort" : "Rejudge"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
