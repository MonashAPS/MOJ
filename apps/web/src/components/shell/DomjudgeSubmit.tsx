"use client";

import { api } from "@convex/_generated/api";
import { Button, Dialog, DialogContent, DialogTrigger, Select } from "@moj/ui";
import { useQuery } from "convex/react";
import { Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { readProblemsJoinCoverAcknowledgement } from "@/app/contest/[key]/actions";
import { SubmitForm } from "@/components/problems/SubmitForm";

type Props = {
  contest: { key: string; name: string; showJoinWarning: boolean };
  problems: { code: string; name: string; label: string }[];
};

/**
 * DOMjudge's Submit button, the one that sits on the bar rather than on a
 * problem.
 *
 * In DOMjudge you submit from anywhere: the button asks which problem, and the
 * rest of the form is the same one the problem's own page carries. That is what
 * this is — the problem picker, then our submit form, which already takes a file
 * or typed source and reads the language off the extension.
 */
export function DomjudgeSubmit({ contest, problems }: Props) {
  const t = useTranslations("problems.submit");
  const [open, setOpen] = useState(false);

  if (problems.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="shrink-0">
          <Upload size={14} aria-hidden />
          {t("submit")}
        </Button>
      </DialogTrigger>

      <DialogContent title={t("title")} width={1000}>
        <DomjudgeSubmitContent key={contest.key} contest={contest} problems={problems} />
      </DialogContent>
    </Dialog>
  );
}

/** Mounted only while open, so each visit reads the current acknowledgement. */
function DomjudgeSubmitContent({ contest, problems }: Props) {
  const t = useTranslations("problems.submit");
  const common = useTranslations("common.states");
  const [code, setCode] = useState(problems[0]?.code ?? "");
  const [acknowledged, setAcknowledged] = useState<boolean | null>(null);
  const preferred = useQuery(api.languages.viewerDefault, {});
  const chosen = problems.find((problem) => problem.code === code) ?? problems[0];

  useEffect(() => {
    let active = true;
    void readProblemsJoinCoverAcknowledgement(contest.key)
      .catch(() => false)
      .then((saved) => {
        if (active) setAcknowledged(saved);
      });

    return () => {
      active = false;
    };
  }, [contest.key]);

  return (
    <>
      <Select
        ariaLabel={t("problem")}
        value={chosen?.code ?? ""}
        onValueChange={setCode}
        options={problems.map((problem) => ({
          value: problem.code,
          label: `${problem.label} — ${problem.name}`,
        }))}
      />

      {acknowledged === null ? (
        <p role="status" className="text-sm text-muted-foreground">
          {common("loading")}
        </p>
      ) : chosen ? (
        // Keyed on the problem, so switching it starts a clean buffer rather
        // than carrying the last one's draft across.
        <SubmitForm
          reminder={{
            key: contest.key,
            name: contest.name,
            eligible: contest.showJoinWarning,
            acknowledged,
            serverHadViewer: true,
          }}
          key={chosen.code}
          compact
          problemCode={chosen.code}
          problemName={chosen.name}
          defaultLanguageKey={preferred?.key ?? null}
          canPinJudge={false}
          submissionsLeft={null}
        />
      ) : null}
    </>
  );
}
