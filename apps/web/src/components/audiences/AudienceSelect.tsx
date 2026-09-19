"use client";

import { AUDIENCES, type Audience, type AudiencePolicy, type Moment } from "@moj/core";
import { Button, Checkbox, cn, Popover, PopoverContent, PopoverTrigger, RadioGroup } from "@moj/ui";
import { ChevronDown, Eye, FlaskConical, Globe, ShieldCheck, Swords } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";

/**
 * Audiences are the one vocabulary for "who" on a contest or a problem. Each
 * has its own mark, shown wherever it is named, and this is the one control
 * for choosing a set of them and the moment they are let in from.
 */

const ICONS = {
  staff: ShieldCheck,
  testers: FlaskConical,
  spectators: Eye,
  contestants: Swords,
  everyone: Globe,
} as const;

function AudienceIcon({ audience, size = 14 }: { audience: Audience; size?: number }) {
  const Icon = ICONS[audience];

  return <Icon size={size} className="shrink-0" aria-hidden />;
}

/** The audience's mark and name together, as it reads everywhere. */
export function AudienceName({ audience }: { audience: Audience }) {
  const t = useTranslations("common.audiences");

  return (
    <span className="inline-flex items-center gap-1.5">
      <AudienceIcon audience={audience} />
      {t(audience)}
    </span>
  );
}

/** The audiences a policy names, in the fixed order, or staff when it names none. */
function named(audiences: readonly Audience[]): readonly Audience[] {
  if (audiences.includes("everyone")) return ["everyone"];

  if (audiences.length === 0) return ["staff"];

  return AUDIENCES.filter((name) => audiences.includes(name));
}

/** A policy as a line of marks and names: "Testers, Contestants · once the contest has ended". */
export function AudienceLine({ policy }: { policy: AudiencePolicy }) {
  const t = useTranslations("common.audiences");

  return (
    <span className="inline-flex flex-wrap items-center gap-x-1 gap-y-0.5">
      {named(policy.audiences).map((audience, index) => (
        <span key={audience} className="inline-flex items-center gap-1">
          {index > 0 ? <span aria-hidden>,</span> : null}
          <AudienceName audience={audience} />
        </span>
      ))}
      {policy.from !== "start" ? (
        <span className="text-muted-foreground">· {t(`from.${policy.from}`)}</span>
      ) : null}
    </span>
  );
}

/**
 * The dropdown: a button that reads as the policy, opening a box with a row
 * per audience and, when the owner has moments to wait for, the moment.
 */
export function AudienceSelect({
  value,
  offered,
  moments,
  onChange,
  id,
  className,
}: {
  value: AudiencePolicy;
  /** Which audiences the owner has at all; a problem has fewer than a contest. */
  offered: readonly Audience[];
  /** Which moments the owner can wait for; none hides the choice. */
  moments: readonly Moment[];
  onChange: (next: AudiencePolicy) => void;
  id?: string;
  className?: string;
}) {
  const t = useTranslations("common.audiences");
  const groupId = useId();
  const everyone = value.audiences.includes("everyone");

  function toggle(audience: Audience, on: boolean) {
    const rest = value.audiences.filter((name) => name !== audience);
    onChange({ audiences: on ? [...rest, audience] : rest, from: value.from });
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="secondary"
          className={cn(
            "h-auto min-h-9 w-full justify-between gap-3 px-3 py-1.5 text-left font-normal",
            className,
          )}
        >
          <AudienceLine policy={value} />
          <ChevronDown size={14} className="shrink-0 text-muted-foreground" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[26rem] max-w-[calc(100vw-2rem)] p-0">
        <ul className="grid">
          {AUDIENCES.filter((audience) => offered.includes(audience)).map((audience) => {
            const staff = audience === "staff";
            // Everyone already covers the others, so they read as included.
            const covered = everyone && !staff && audience !== "everyone";

            return (
              <li key={audience} className="border-b border-border px-3 py-2.5 last:border-b-0">
                <Checkbox
                  label={<AudienceName audience={audience} />}
                  checked={staff || covered || value.audiences.includes(audience)}
                  disabled={staff || covered}
                  onCheckedChange={(on) => toggle(audience, on)}
                />
                <p className="pl-6 text-xs text-muted-foreground">{t(`${audience}Hint`)}</p>
              </li>
            );
          })}
        </ul>

        {moments.length > 1 ? (
          <div className="border-t border-border px-3 py-2.5">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-label text-muted-foreground">
              {t("fromLabel")}
            </p>
            <RadioGroup
              name={groupId}
              ariaLabel={t("fromLabel")}
              value={value.from}
              onValueChange={(next) =>
                onChange({
                  audiences: [...value.audiences],
                  from: moments.find((candidate) => candidate === next) ?? value.from,
                })
              }
              options={moments.map((moment) => ({ value: moment, label: t(`from.${moment}`) }))}
            />
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

/** The audiences of a policy as one localised phrase, for prose that has no room for marks. */
export function useAudienceNames(): (audiences: readonly Audience[]) => string {
  const t = useTranslations("common.audiences");

  return (audiences) =>
    named(audiences)
      .map((audience) => t(audience))
      .join(", ");
}
