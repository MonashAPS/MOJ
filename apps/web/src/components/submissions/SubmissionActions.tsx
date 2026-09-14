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
import { useTranslations } from "next-intl";
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
  const t = useTranslations("submissions.actions");
  const common = useTranslations("common.actions");
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
        toast.success(t("rejudgeQueued", { id: submissionId }));
      } else {
        const outcome = await abort({ submissionId });
        toast.success(
          outcome.pending ? t("abortAsked", { id: submissionId }) : t("abortDone", { id: submissionId }),
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("failed"));
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
          {t("abort")}
        </Button>
      ) : null}
      {canRejudge && !grading ? (
        <Button
          variant="secondary"
          size="sm"
          busy={busy}
          disabled={isLocked}
          title={isLocked ? t("locked") : undefined}
          onClick={() => setOpen("rejudge")}
          icon={<RefreshCw aria-hidden />}
        >
          {t("rejudge")}
        </Button>
      ) : null}

      <AlertDialog open={open !== null} onOpenChange={(next) => !next && setOpen(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {open === "abort"
                ? t("abortTitle", { id: submissionId })
                : t("rejudgeTitle", { id: submissionId })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {open === "abort" ? t("abortDescription") : t("rejudgeDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{common("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={run}>
              {open === "abort" ? t("abort") : t("rejudge")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
