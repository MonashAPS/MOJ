"use client";

import type { ContestWarning, SummaryGroup, SummaryLine } from "@moj/core";
import { cn, Panel } from "@moj/ui";
import { AlertTriangle, CircleAlert, Info } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

/**
 * "What this contest will do" — the settings read back as consequences, beside
 * the form that sets them.
 *
 * This is the piece the redesign exists for. Labels tell you what a field is
 * called; a contest went out wrong because nothing told anyone what setting it
 * would *do*. The panel describes the draft rather than the saved contest, so
 * the sentence changes as you type and the damage is visible before Save.
 */

const GROUPS: readonly SummaryGroup[] = ["when", "who", "scoring", "rating"];

const SEVERITY_ICON = {
  blocked: CircleAlert,
  danger: AlertTriangle,
  caution: Info,
} as const;

const SEVERITY_CLASS = {
  blocked: "text-(--v-bad)",
  danger: "text-(--v-warn)",
  caution: "text-muted-foreground",
} as const;

export function ContestSummary({
  lines,
  warnings,
  dirty,
  className,
}: {
  lines: readonly SummaryLine[];
  warnings: readonly ContestWarning[];
  dirty: boolean;
  className?: string;
}) {
  const t = useTranslations("admin.contests.summary");
  const warn = useTranslations("admin.contests.warnings");

  return (
    <Panel
      title={t("title")}
      className={cn("lg:sticky lg:top-(--sticky-top) lg:self-start", className)}
      bodyClassName="grid gap-4 p-4"
    >
      {dirty ? (
        <p className="font-sans text-xs font-semibold uppercase tracking-label text-(--v-warn)">
          {t("unsaved")}
        </p>
      ) : null}

      {GROUPS.map((group) => {
        const inGroup = lines.filter((line) => line.group === group);

        if (inGroup.length === 0) return null;

        return (
          <section key={group} className="grid gap-1">
            <h3 className="font-sans text-xs font-semibold uppercase tracking-label text-muted-foreground">
              {t(`group.${group}`)}
            </h3>
            {inGroup.map((line) => (
              <p key={`${group}.${line.key}`} className="text-sm text-foreground">
                {t(`${group}.${line.key}`, line.values)}
              </p>
            ))}
          </section>
        );
      })}

      {warnings.length > 0 ? (
        <section className="grid gap-2 border-t border-border pt-3">
          <h3 className="font-sans text-xs font-semibold uppercase tracking-label text-muted-foreground">
            {t("group.check")}
          </h3>
          {warnings.map((warning) => (
            <WarningLine
              key={warning.key}
              severity={warning.severity}
              text={warn(warning.key, warning.values)}
            />
          ))}
        </section>
      ) : null}
    </Panel>
  );
}

function WarningLine({ severity, text }: { severity: ContestWarning["severity"]; text: string }): ReactNode {
  const Icon = SEVERITY_ICON[severity];

  return (
    <p
      className={cn(
        "grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2 text-sm",
        SEVERITY_CLASS[severity],
      )}
    >
      <Icon size={14} className="mt-0.5" aria-hidden />
      <span>{text}</span>
    </p>
  );
}
