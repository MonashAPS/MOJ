"use client";

import { Field, FieldGroup, Input, RadioGroup } from "@moj/ui";
import { useTranslations } from "next-intl";
import { useId, useRef } from "react";
import { DateTimeField } from "@/components/admin";

/**
 * When a contest runs, and whose clock it runs on.
 *
 * The section this replaces offered Start, End and an optional number called
 * "Time limit". Filling it in does not cap anything visible — it makes the
 * contest per-participant and moves every competitor's penalty clock to the
 * moment they joined, which is how a contest went out with its standings
 * measured from when people happened to click Start. The field is gone; the
 * choice is two cards, and the second one says what it does.
 */
type ScheduleMode = "together" | "window";

function scheduleModeOf(windowMinutes: string): ScheduleMode {
  return windowMinutes.trim() === "" ? "together" : "window";
}

export function ContestScheduleFields({
  startTime,
  endTime,
  windowMinutes,
  lockedAfter,
  canLock,
  lockDisabledReason,
  onChange,
}: {
  startTime: number | null;
  endTime: number | null;
  /** Minutes each contestant gets, or "" for the whole contest. */
  windowMinutes: string;
  lockedAfter: number | null;
  canLock: boolean;
  lockDisabledReason: string;
  onChange: (patch: {
    startTime?: number | null;
    endTime?: number | null;
    windowMinutes?: string;
    lockedAfter?: number | null;
  }) => void;
}) {
  const t = useTranslations("admin.contests.setup");
  const ids = { start: useId(), end: useId(), window: useId(), locked: useId() };
  const mode = scheduleModeOf(windowMinutes);

  /**
   * What the window was before it was cleared, so switching to "everyone at
   * once" and back is not a retyping exercise. The draft really does hold "",
   * so a save while the card is on `together` still clears the field.
   */
  const lastWindow = useRef("180");

  if (mode === "window") lastWindow.current = windowMinutes;

  return (
    <>
      <RadioGroup
        variant="card"
        name="schedule-mode"
        ariaLabel={t("scheduleMode")}
        value={mode}
        onValueChange={(next) => onChange({ windowMinutes: next === "window" ? lastWindow.current : "" })}
        options={[
          {
            value: "together",
            label: t("scheduleTogether"),
            description: t("scheduleTogetherHint"),
          },
          {
            value: "window",
            label: t("scheduleWindow"),
            description: t("scheduleWindowHint"),
          },
        ]}
      />

      <FieldGroup columns={2}>
        <Field label={mode === "window" ? t("opens") : t("starts")} htmlFor={ids.start}>
          <DateTimeField
            id={ids.start}
            value={startTime}
            onChange={(value) => onChange({ startTime: value })}
            ariaLabel={mode === "window" ? t("opens") : t("starts")}
          />
        </Field>
        <Field label={mode === "window" ? t("closes") : t("ends")} htmlFor={ids.end}>
          <DateTimeField
            id={ids.end}
            value={endTime}
            onChange={(value) => onChange({ endTime: value })}
            ariaLabel={mode === "window" ? t("closes") : t("ends")}
          />
        </Field>

        {mode === "window" ? (
          <Field label={t("windowLength")} htmlFor={ids.window} hint={t("windowLengthHint")}>
            <Input
              id={ids.window}
              mono
              inputMode="numeric"
              value={windowMinutes}
              onChange={(event) => onChange({ windowMinutes: event.target.value })}
              placeholder="180"
            />
          </Field>
        ) : null}

        <Field label={t("lockedAfter")} htmlFor={ids.locked}>
          {/* A permission you lack disables the control and says why, rather than
              hiding it and letting you believe the setting does not exist. */}
          <div title={canLock ? undefined : lockDisabledReason}>
            <DateTimeField
              id={ids.locked}
              value={lockedAfter}
              onChange={(value) => onChange({ lockedAfter: value })}
              clearable
              ariaLabel={t("lockedAfter")}
              disabled={!canLock}
            />
          </div>
        </Field>
      </FieldGroup>
    </>
  );
}
