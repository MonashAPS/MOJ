"use client";

import { api } from "@convex/_generated/api";
import { Button, Dialog, DialogContent, DialogTrigger, Select } from "@moj/ui";
import { useQuery } from "convex/react";
import { Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { SubmitForm } from "@/components/problems/SubmitForm";

/**
 * DOMjudge's Submit button, the one that sits on the bar rather than on a
 * problem.
 *
 * In DOMjudge you submit from anywhere: the button asks which problem, and the
 * rest of the form is the same one the problem's own page carries. That is what
 * this is — the problem picker, then our submit form, which already takes a file
 * or typed source and reads the language off the extension.
 */
export function DomjudgeSubmit({ problems }: { problems: { code: string; name: string; label: string }[] }) {
  const t = useTranslations("problems.submit");
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(problems[0]?.code ?? "");
  // Only once the dialog is open: the bar should not ask the server anything on
  // every page load for a button nobody has pressed.
  const preferred = useQuery(api.languages.viewerDefault, open ? {} : "skip");

  if (problems.length === 0) return null;
  const chosen = problems.find((problem) => problem.code === code) ?? problems[0];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="shrink-0">
          <Upload size={14} aria-hidden />
          {t("submit")}
        </Button>
      </DialogTrigger>

      <DialogContent title={t("title")} width={1000}>
        <Select
          ariaLabel={t("problem")}
          value={chosen?.code ?? ""}
          onValueChange={setCode}
          options={problems.map((problem) => ({
            value: problem.code,
            label: `${problem.label} — ${problem.name}`,
          }))}
        />

        {chosen ? (
          // Keyed on the problem, so switching it starts a clean buffer rather
          // than carrying the last one's draft across.
          <SubmitForm
            key={chosen.code}
            compact
            problemCode={chosen.code}
            problemName={chosen.name}
            defaultLanguageKey={preferred?.key ?? null}
            canPinJudge={false}
            submissionsLeft={null}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
