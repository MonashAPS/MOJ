"use client";

import { Dialog, DialogContent, DialogTrigger } from "@moj/ui";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { SubmitForm } from "@/components/problems/SubmitForm";

/**
 * Submitting from the list a contest's problems are named in, the way
 * DOMjudge's team pages do it.
 *
 * During a contest the list is the page people live on, and sending a solution
 * from it should not mean losing your place: the same form the problem's own
 * submit page carries opens over it, file picker and all.
 */
export function QuickSubmit({
  problemCode,
  problemName,
  defaultLanguageKey,
  submissionsLeft,
  children,
}: {
  problemCode: string;
  problemName: string;
  defaultLanguageKey: string | null;
  submissionsLeft: number | null;
  /** The trigger, so the caller styles the button to suit its row. */
  children: React.ReactNode;
}) {
  const t = useTranslations("problems.submit");
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      {/* Mounted on open, so a list of ten problems is ten buttons and not ten
          editors, each with its own language query. */}
      <DialogContent title={t("titleFor", { name: problemName })} width={1000}>
        <SubmitForm
          compact
          problemCode={problemCode}
          problemName={problemName}
          defaultLanguageKey={defaultLanguageKey}
          canPinJudge={false}
          submissionsLeft={submissionsLeft}
        />
        <Link
          href={`/problem/${problemCode}/submit/`}
          className="text-sm text-muted-foreground hover:text-link"
        >
          {t("openFullPage")}
        </Link>
      </DialogContent>
    </Dialog>
  );
}
