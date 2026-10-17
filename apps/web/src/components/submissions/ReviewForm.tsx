"use client";

import { api } from "@convex/_generated/api";
import { Button, Field, Input, Textarea, toast } from "@moj/ui";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";
import { mutationError } from "@/lib/convex-error";
import { formatPoints } from "@/lib/submissionFormat";

/**
 * A staff score for a submission to a staff-scored problem: the score out of
 * `outOf` and a note its author sees with it. Scoring one that already has a
 * score replaces it.
 */
export function ReviewForm({
  submissionId,
  outOf,
  initialScore,
  initialFeedback,
  onSaved,
  autoFocus = false,
}: {
  submissionId: string;
  outOf: number;
  initialScore: number | null;
  initialFeedback: string | null;
  onSaved?: () => void;
  autoFocus?: boolean;
}) {
  const t = useTranslations("submissions.review");
  const review = useMutation(api.submissions.review);
  const ids = { score: useId(), feedback: useId() };

  const [score, setScore] = useState(initialScore === null ? "" : String(initialScore));
  const [feedback, setFeedback] = useState(initialFeedback ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Another submission, or someone else's score landing, starts the form again.
  useEffect(() => {
    setScore(initialScore === null ? "" : String(initialScore));
    setFeedback(initialFeedback ?? "");
    setError(null);
  }, [initialScore, initialFeedback]);

  const value = Number(score);
  const valid = score.trim() !== "" && Number.isFinite(value) && value >= 0 && value <= outOf;

  async function save() {
    if (!valid) {
      setError(t("invalid", { total: formatPoints(outOf) }));

      return;
    }

    setError(null);
    setBusy(true);

    try {
      await review({ submissionId, score: value, feedback });
      toast.success(t("saved"));
      onSaved?.();
    } catch (caught) {
      setError(mutationError(caught, t("failed")));
    }

    setBusy(false);
  }

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <Field label={t("score")} htmlFor={ids.score} hint={t("scoreHint")} error={error ?? undefined}>
        <div className="flex items-center gap-2">
          <Input
            id={ids.score}
            mono
            inputMode="decimal"
            value={score}
            invalid={error !== null}
            autoFocus={autoFocus}
            onChange={(event) => setScore(event.target.value)}
            className="w-28"
          />
          <span className="text-sm text-muted-foreground">{t("outOf", { total: formatPoints(outOf) })}</span>
        </div>
      </Field>
      <Field label={t("feedback")} htmlFor={ids.feedback} optional={` ${t("feedbackOptional")}`}>
        <Textarea
          id={ids.feedback}
          rows={4}
          value={feedback}
          maxLength={4000}
          placeholder={t("feedbackPlaceholder")}
          onChange={(event) => setFeedback(event.target.value)}
        />
      </Field>
      <div>
        <Button type="submit" size="sm" busy={busy}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
