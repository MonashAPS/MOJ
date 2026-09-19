"use client";

import { Field, FieldGroup, Input, RadioGroup, Select } from "@moj/ui";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { AdminCheckField, UserPicker } from "@/components/admin";

/**
 * Whether the board freezes, and whether the contest counts.
 *
 * Both were clusters of settings that are inert without the one that turns them
 * on: `blindDuringFreeze` does nothing at a freeze of zero minutes, and all five
 * rating settings do nothing on an unrated contest — but the form left every one
 * of them enabled, so they read as things that were in effect.
 */

export interface FreezeValues {
  freezeMinutes: string;
  blindDuringFreeze: boolean;
  scoreboardVisibility: string;
}

export interface RatingValues {
  isRated: boolean;
  rateAll: boolean;
  ratingFloor: string;
  ratingCeiling: string;
  performanceCeiling: string;
  rateExclude: string[];
}

export function ContestFreezeFields({
  values,
  scoreboardOptions,
  onChange,
}: {
  values: FreezeValues;
  scoreboardOptions: { value: string; label: string }[];
  onChange: (patch: Partial<FreezeValues>) => void;
}) {
  const t = useTranslations("admin.contests.setup");
  const ids = { minutes: useId(), scoreboard: useId() };
  const frozen = (Number(values.freezeMinutes) || 0) > 0;

  return (
    <>
      <FieldGroup columns={2}>
        <Field label={t("scoreboardVisibility")} htmlFor={ids.scoreboard}>
          <Select
            id={ids.scoreboard}
            value={values.scoreboardVisibility}
            onValueChange={(value) => onChange({ scoreboardVisibility: value })}
            options={scoreboardOptions}
          />
        </Field>
      </FieldGroup>

      <RadioGroup
        variant="card"
        name="freeze-mode"
        ariaLabel={t("freezeMode")}
        value={frozen ? "freeze" : "none"}
        // Turning the freeze off clears the blind with it, because a blind of
        // nothing is a setting that reads as on and does nothing.
        onValueChange={(next) =>
          onChange(
            next === "freeze" ? { freezeMinutes: "60" } : { freezeMinutes: "0", blindDuringFreeze: false },
          )
        }
        options={[
          { value: "none", label: t("freezeNone"), description: t("freezeNoneHint") },
          { value: "freeze", label: t("freezeLast"), description: t("freezeLastHint") },
        ]}
      />

      {frozen ? (
        <FieldGroup columns={2}>
          <Field label={t("freezeMinutes")} htmlFor={ids.minutes} hint={t("freezeMinutesHint")}>
            <Input
              id={ids.minutes}
              mono
              inputMode="numeric"
              value={values.freezeMinutes}
              onChange={(event) => onChange({ freezeMinutes: event.target.value })}
            />
          </Field>
          <AdminCheckField
            label={t("blindDuringFreeze")}
            hint={t("blindDuringFreezeHint")}
            checked={values.blindDuringFreeze}
            onCheckedChange={(checked) => onChange({ blindDuringFreeze: checked })}
          />
        </FieldGroup>
      ) : null}
    </>
  );
}

export function ContestRatingFields({
  values,
  canRate,
  canOverridePerformanceCeiling,
  missingPermission,
  onChange,
}: {
  values: RatingValues;
  canRate: boolean;
  canOverridePerformanceCeiling: boolean;
  missingPermission: (permission: string) => string;
  onChange: (patch: Partial<RatingValues>) => void;
}) {
  const t = useTranslations("admin.contests.setup");
  const ids = { floor: useId(), ceiling: useId(), performance: useId(), exclude: useId() };

  return (
    <>
      <RadioGroup
        variant="card"
        name="rating-mode"
        ariaLabel={t("ratingMode")}
        value={values.isRated ? "rated" : "unrated"}
        onValueChange={(next) => onChange({ isRated: next === "rated" })}
        options={[
          { value: "unrated", label: t("unrated"), description: t("unratedHint") },
          { value: "rated", label: t("rated"), description: t("ratedHint"), disabled: !canRate },
        ]}
      />

      {values.isRated ? (
        <>
          <RadioGroup
            name="rate-who"
            ariaLabel={t("rateWho")}
            value={values.rateAll ? "everyone" : "scorers"}
            onValueChange={(next) => onChange({ rateAll: next === "everyone" })}
            options={[
              { value: "scorers", label: t("rateScorers") },
              { value: "everyone", label: t("rateEveryone") },
            ]}
          />

          <FieldGroup columns={2}>
            <Field label={t("ratingFloor")} htmlFor={ids.floor} hint={t("ratingFloorHint")}>
              <Input
                id={ids.floor}
                mono
                inputMode="numeric"
                value={values.ratingFloor}
                onChange={(event) => onChange({ ratingFloor: event.target.value })}
              />
            </Field>
            <Field label={t("ratingCeiling")} htmlFor={ids.ceiling} hint={t("ratingCeilingHint")}>
              <Input
                id={ids.ceiling}
                mono
                inputMode="numeric"
                value={values.ratingCeiling}
                onChange={(event) => onChange({ ratingCeiling: event.target.value })}
              />
            </Field>
            <Field
              label={t("performanceCeiling")}
              htmlFor={ids.performance}
              hint={t("performanceCeilingHint")}
            >
              <Input
                id={ids.performance}
                mono
                inputMode="numeric"
                disabled={!canOverridePerformanceCeiling}
                title={
                  canOverridePerformanceCeiling
                    ? undefined
                    : missingPermission("judge.override_performance_ceiling")
                }
                value={values.performanceCeiling}
                onChange={(event) => onChange({ performanceCeiling: event.target.value })}
              />
            </Field>
            <Field label={t("rateExclude")} htmlFor={ids.exclude} className="sm:col-span-2">
              <UserPicker
                id={ids.exclude}
                values={values.rateExclude}
                onChange={(next) => onChange({ rateExclude: next })}
                ariaLabel={t("rateExclude")}
              />
            </Field>
          </FieldGroup>
        </>
      ) : null}
    </>
  );
}
