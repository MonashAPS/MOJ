"use client";

import { cn, MicroLabel, Progress } from "@moj/ui";
import { useTranslations } from "next-intl";

/** `word` is a message key rather than the word itself, so the meter reads in
 *  the viewer's language without `strengthOf` needing a translator. */
export type Strength = {
  value: number;
  word: "" | "weak" | "fair" | "strong";
  tone: "bad" | "warn" | "good";
};

/** A word, never a score: the meter says Weak / Fair / Strong and nothing else
 *  (DESIGN.md section 18). Shared by register and every password form. */
export function strengthOf(password: string): Strength {
  if (!password) return { value: 0, word: "", tone: "bad" };
  let points = 0;
  if (password.length >= 8) points += 1;
  if (password.length >= 12) points += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) points += 1;
  if (/\d/.test(password)) points += 1;
  if (/[^\w]/.test(password)) points += 1;
  if (/^\d+$/.test(password)) points = Math.min(points, 1);
  if (points <= 2) return { value: 33, word: "weak", tone: "bad" };
  if (points <= 4) return { value: 66, word: "fair", tone: "warn" };
  return { value: 100, word: "strong", tone: "good" };
}

export function PasswordStrength({ password, className }: { password: string; className?: string }) {
  const t = useTranslations("auth.accounts.passwordStrength");
  const strength = strengthOf(password);
  return (
    <div className={cn("grid gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <MicroLabel>{t("label")}</MicroLabel>
        {strength.word ? (
          <span
            className={cn(
              "text-sm font-medium",
              strength.tone === "bad" && "text-bad",
              strength.tone === "warn" && "text-warn",
              strength.tone === "good" && "text-good",
            )}
          >
            {t(strength.word)}
          </span>
        ) : null}
      </div>
      <Progress value={strength.value} tone={strength.tone} aria-label="Password strength" />
    </div>
  );
}
