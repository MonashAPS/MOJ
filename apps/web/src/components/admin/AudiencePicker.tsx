"use client";

import { AUDIENCES, type Audience } from "@moj/core";
import { Checkbox, Field, Select } from "@moj/ui";
import { Eye, FlaskConical, Globe, ShieldCheck, Swords } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useId } from "react";

/** One mark per audience, shown wherever the audience is named. */
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
  const t = useTranslations("admin.components.audiences");

  return (
    <span className="inline-flex items-center gap-1.5">
      <AudienceIcon audience={audience} />
      {t(audience)}
    </span>
  );
}

/**
 * Who, and from when: the one control for choosing an audience, so a file, a
 * scoreboard and the People tab all mean the same people by the same names.
 * Staff are always in and shown as such rather than offered.
 */
export function AudiencePicker({
  value,
  from,
  offered,
  hasEnd,
  onChange,
}: {
  value: readonly Audience[];
  from: "now" | "end";
  /** Which audiences the owner has at all; a problem has fewer than a contest. */
  offered: readonly Audience[];
  /** Whether "once it has ended" is a moment the owner will reach. */
  hasEnd: boolean;
  onChange: (next: { audiences: Audience[]; from: "now" | "end" }) => void;
}) {
  const t = useTranslations("admin.components.audiences");
  const fromId = useId();
  const everyone = value.includes("everyone");

  function toggle(audience: Audience, on: boolean) {
    const rest = value.filter((name) => name !== audience);
    onChange({ audiences: on ? [...rest, audience] : rest, from });
  }

  return (
    <div className="grid gap-3">
      <ul className="grid gap-2">
        {AUDIENCES.filter((audience) => offered.includes(audience)).map((audience) => {
          const staff = audience === "staff";
          // Everyone already covers the others, so they read as included.
          const covered = everyone && !staff && audience !== "everyone";

          return (
            <li key={audience} className="grid gap-0.5">
              <Checkbox
                label={<AudienceName audience={audience} />}
                checked={staff || covered || value.includes(audience)}
                disabled={staff || covered}
                onCheckedChange={(on) => toggle(audience, on)}
              />
              <span className="pl-6 text-xs text-muted-foreground">
                {staff ? t("staffAlways") : t(`${audience}Hint`)}
              </span>
            </li>
          );
        })}
      </ul>

      {hasEnd ? (
        <Field label={t("from")} htmlFor={fromId}>
          <Select
            id={fromId}
            value={from}
            onValueChange={(next) =>
              onChange({ audiences: [...value], from: next === "end" ? "end" : "now" })
            }
            options={[
              { value: "now", label: t("fromNow") },
              { value: "end", label: t("fromEnd") },
            ]}
          />
        </Field>
      ) : null}
    </div>
  );
}

/** The audiences of a file, as a line of marks and names: "Testers, Contestants · once it has ended". */
export function AudienceLine({ audiences, from }: { audiences: readonly Audience[]; from: "now" | "end" }) {
  const t = useTranslations("admin.components.audiences");

  const named: readonly Audience[] = audiences.includes("everyone")
    ? ["everyone"]
    : audiences.length === 0
      ? ["staff"]
      : AUDIENCES.filter((name) => audiences.includes(name));

  const marks: ReactNode[] = named.map((audience, index) => (
    <span key={audience} className="inline-flex items-center gap-1.5">
      {index > 0 ? <span aria-hidden>, </span> : null}
      <AudienceName audience={audience} />
    </span>
  ));

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {marks}
      {from === "end" ? <span className="text-muted-foreground"> · {t("fromEnd")}</span> : null}
    </span>
  );
}
