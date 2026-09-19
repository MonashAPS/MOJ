"use client";

import type { ContestWarning } from "@moj/core";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@moj/ui";
import { useTranslations } from "next-intl";

/**
 * The last thing between a legal-but-surprising setting and the standings.
 *
 * A danger is not an error: the configuration works, it just does something
 * other than what it looks like. Disabling Save over one would be wrong — it is
 * sometimes exactly what the operator wants, and a form that refuses a legal
 * setting is a form people work around. So the save goes through, once, after
 * being told in a sentence what it will do.
 *
 * What was acknowledged is appended to the revision reason, so the history
 * records that somebody was warned rather than only that the value changed.
 */
export function ContestDangerDialog({
  warnings,
  open,
  onOpenChange,
  onConfirm,
}: {
  warnings: readonly ContestWarning[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("admin.contests.summary");
  const warn = useTranslations("admin.contests.warnings");

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("confirmTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("confirmBody")}</AlertDialogDescription>
        </AlertDialogHeader>

        <ul className="grid gap-2">
          {warnings.map((warning) => (
            <li key={warning.key} className="text-sm text-foreground">
              {warn(warning.key, warning.values)}
            </li>
          ))}
        </ul>

        <AlertDialogFooter>
          <AlertDialogCancel>{t("confirmCancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{t("confirmSave")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** What the revision records about a warning somebody saved through. */
export function acknowledgedReason(reason: string, warnings: readonly ContestWarning[]): string {
  if (warnings.length === 0) return reason;
  const keys = warnings.map((warning) => warning.key).join(", ");
  const note = `Saved through: ${keys}`;

  return reason.trim() ? `${reason.trim()} — ${note}` : note;
}
