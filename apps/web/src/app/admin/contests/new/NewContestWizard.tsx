"use client";

import { api } from "@convex/_generated/api";
import { contestWarnings, type DescribeSource, describeContest } from "@moj/core";
import { Button, cn, Field, FieldGroup, Input, RadioGroup } from "@moj/ui";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { ContestSummary } from "@/app/admin/contests/[key]/ContestSummary";
import { AdminCheckField, AdminFormError, AdminSection, AdminShell, DateTimeField } from "@/components/admin";
import { useHumanDuration } from "@/components/contests/pieces";
import { formatDateTime } from "@/lib/format";

/**
 * Creating a contest, as three questions rather than one form.
 *
 * The form this replaces asked for eleven fields at once, none of which said
 * what they would do, and would not validate until you had touched every one.
 * The questions here are the ones that decide the rest — what kind of contest,
 * when it runs, who it is for — and the summary fills in beside them as you go,
 * so what the contest will do is visible before it exists.
 *
 * Step one can finish it. Someone who knows what they want types an id and a
 * name and presses Create, and the schedule they get is the same one the old
 * form defaulted to. Steps two and three only ever refine an already-valid
 * draft, which is why the button is live from the start rather than at the end.
 */

const HOUR = 3600_000;

const STEPS = ["what", "when", "who"] as const;

type Step = (typeof STEPS)[number];

interface Draft {
  key: string;
  name: string;
  startTime: number | null;
  endTime: number | null;
  windowMinutes: string;
  formatName: string;
  isVisible: boolean;
  isRated: boolean;
  publishProblemsAtEnd: boolean;
  useClarifications: boolean;
}

function emptyDraft(now: number): Draft {
  return {
    key: "",
    name: "",
    startTime: now + HOUR,
    endTime: now + 4 * HOUR,
    windowMinutes: "",
    formatName: "default",
    isVisible: false,
    isRated: false,
    publishProblemsAtEnd: false,
    useClarifications: true,
  };
}

/** A name suggests an id until somebody types one of their own. */
function keyFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 20);
}

export function NewContestWizard() {
  const t = useTranslations("admin.contests.new");
  const setup = useTranslations("admin.contests.setup");
  const actions = useTranslations("common.actions");
  const router = useRouter();
  const create = useMutation(api.admin.contests.create);
  const formats = useQuery(api.contests.formats.list, {});
  const humanDuration = useHumanDuration();

  const ids = { key: useId(), name: useId(), start: useId(), end: useId(), window: useId() };
  const [step, setStep] = useState<Step>("what");
  const [draft, setDraft] = useState(() => emptyDraft(Date.now()));
  const [keyEdited, setKeyEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const change = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));

  const keyOk = /^[a-z0-9]+$/.test(draft.key) && draft.key.length <= 20;
  const ready = keyOk && draft.name.trim().length > 0;

  const schedule = draft.windowMinutes.trim()
    ? { kind: "window" as const, seconds: Number(draft.windowMinutes) * 60 }
    : { kind: "together" as const };

  const rating = draft.isRated ? { everyone: false, excludeProfileIds: [] } : undefined;

  const describeSource: DescribeSource = {
    startTime: draft.startTime ?? Date.now(),
    endTime: draft.endTime ?? Date.now() + HOUR,
    schedule,
    entry: { kind: "open" },
    labels: { kind: "letters" },
    rating,
    isVisible: draft.isVisible,
    publishProblemsAtEnd: draft.publishProblemsAtEnd,
  };

  async function submit() {
    setError(null);

    if (!keyOk) {
      setError(t("errorKey"));

      return;
    }

    if (!draft.name.trim()) {
      setError(t("errorName"));

      return;
    }

    if (!draft.startTime || !draft.endTime || draft.endTime <= draft.startTime) {
      setError(t("errorWindow"));

      return;
    }

    setBusy(true);

    try {
      const result = await create({
        key: draft.key,
        name: draft.name.trim(),
        startTime: draft.startTime,
        endTime: draft.endTime,
        schedule,
        formatName: draft.formatName,
        isVisible: draft.isVisible,
        rating,
        publishProblemsAtEnd: draft.publishProblemsAtEnd,
        useClarifications: draft.useClarifications,
      });

      // Problems are the one thing every new contest lacks, so that is where it
      // opens rather than back on the page that was just filled in.
      router.push(`/admin/contests/${result.key}/?tab=problems&created=1`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("errorCreate"));
      setBusy(false);
    }
  }

  /** Enter advances, Cmd/Ctrl+Enter creates from wherever you are. */
  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key !== "Enter") return;

    if (event.metaKey || event.ctrlKey) {
      event.preventDefault();
      void submit();

      return;
    }

    if (step !== "who" && ready) {
      event.preventDefault();
      setStep(STEPS[STEPS.indexOf(step) + 1] ?? step);
    }
  }

  return (
    <AdminShell
      title={t("title")}
      breadcrumb={[
        { label: t("breadcrumbConsole"), href: "/admin/" },
        { label: t("breadcrumbContests"), href: "/admin/contests/" },
        { label: t("breadcrumbNew") },
      ]}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)] lg:items-start">
        {/* biome-ignore lint/a11y/noStaticElementInteractions: the shortcut is a
            convenience on top of the buttons below, not the only way through. */}
        <div className="grid gap-4" onKeyDown={onKeyDown}>
          <Steps step={step} onSelect={setStep} ready={ready} />
          <AdminFormError message={error} />

          {step === "what" ? (
            <AdminSection title={t("stepWhatTitle")} description={t("stepWhatHint")} columns={1}>
              <FieldGroup columns={2}>
                <Field label={t("name")} htmlFor={ids.name}>
                  <Input
                    id={ids.name}
                    value={draft.name}
                    onChange={(event) => {
                      const name = event.target.value;
                      change(keyEdited ? { name } : { name, key: keyFromName(name) });
                    }}
                  />
                </Field>
                <Field label={t("key")} htmlFor={ids.key} hint={t("keyHint")}>
                  <Input
                    id={ids.key}
                    mono
                    maxLength={20}
                    value={draft.key}
                    onChange={(event) => {
                      setKeyEdited(true);
                      change({ key: event.target.value.toLowerCase() });
                    }}
                  />
                </Field>
              </FieldGroup>

              <RadioGroup
                variant="card"
                name="format"
                ariaLabel={t("format")}
                value={draft.formatName}
                onValueChange={(value) => change({ formatName: value })}
                options={(formats ?? []).map((row) => ({
                  value: row.name,
                  label: row.displayName,
                }))}
              />
            </AdminSection>
          ) : null}

          {step === "when" ? (
            <AdminSection title={t("stepWhenTitle")} description={t("stepWhenHint")} columns={1}>
              <div className="flex flex-wrap gap-2">
                {presets(t).map((preset) => (
                  <Button
                    key={preset.label}
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => change(preset.apply())}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>

              <RadioGroup
                variant="card"
                name="schedule-mode"
                ariaLabel={setup("scheduleMode")}
                value={draft.windowMinutes.trim() ? "window" : "together"}
                onValueChange={(next) => change({ windowMinutes: next === "window" ? "180" : "" })}
                options={[
                  {
                    value: "together",
                    label: setup("scheduleTogether"),
                    description: setup("scheduleTogetherHint"),
                  },
                  {
                    value: "window",
                    label: setup("scheduleWindow"),
                    description: setup("scheduleWindowHint"),
                  },
                ]}
              />

              <FieldGroup columns={2}>
                <Field label={setup("starts")} htmlFor={ids.start}>
                  <DateTimeField
                    id={ids.start}
                    value={draft.startTime}
                    onChange={(value) => change({ startTime: value })}
                    ariaLabel={setup("starts")}
                  />
                </Field>
                <Field label={setup("ends")} htmlFor={ids.end}>
                  <DateTimeField
                    id={ids.end}
                    value={draft.endTime}
                    onChange={(value) => change({ endTime: value })}
                    ariaLabel={setup("ends")}
                  />
                </Field>
                {draft.windowMinutes.trim() ? (
                  <Field label={setup("windowLength")} htmlFor={ids.window} hint={setup("windowLengthHint")}>
                    <Input
                      id={ids.window}
                      mono
                      inputMode="numeric"
                      value={draft.windowMinutes}
                      onChange={(event) => change({ windowMinutes: event.target.value })}
                    />
                  </Field>
                ) : null}
              </FieldGroup>
            </AdminSection>
          ) : null}

          {step === "who" ? (
            <AdminSection title={t("stepWhoTitle")} description={t("stepWhoHint")} columns={1}>
              <AdminCheckField
                label={setup("visible")}
                hint={setup("visibleHint")}
                checked={draft.isVisible}
                onCheckedChange={(checked) => change({ isVisible: checked })}
              />
              <AdminCheckField
                label={t("clarifications")}
                hint={t("clarificationsHint")}
                checked={draft.useClarifications}
                onCheckedChange={(checked) => change({ useClarifications: checked })}
              />
              <AdminCheckField
                label={setup("afterEndPublish")}
                hint={setup("afterEndPublishHint")}
                checked={draft.publishProblemsAtEnd}
                onCheckedChange={(checked) => change({ publishProblemsAtEnd: checked })}
              />
              <RadioGroup
                variant="card"
                name="rating-mode"
                ariaLabel={setup("ratingMode")}
                value={draft.isRated ? "rated" : "unrated"}
                onValueChange={(next) => change({ isRated: next === "rated" })}
                options={[
                  { value: "unrated", label: setup("unrated"), description: setup("unratedHint") },
                  { value: "rated", label: setup("rated"), description: setup("ratedHint") },
                ]}
              />
            </AdminSection>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={step === "what"}
              onClick={() => setStep(STEPS[STEPS.indexOf(step) - 1] ?? step)}
            >
              {t("back")}
            </Button>

            <div className="flex items-center gap-2">
              {step !== "who" ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!ready}
                  onClick={() => setStep(STEPS[STEPS.indexOf(step) + 1] ?? step)}
                >
                  {t("continue")}
                </Button>
              ) : null}
              <Button type="button" disabled={!ready || busy} onClick={() => void submit()}>
                {busy ? actions("create") : t("createAndOpen")}
              </Button>
            </div>
          </div>
        </div>

        <ContestSummary
          lines={describeContest(describeSource, { moment: formatDateTime, duration: humanDuration })}
          warnings={contestWarnings(describeSource)}
          dirty={false}
        />
      </div>
    </AdminShell>
  );
}

/** Three buttons that also say where you are; not a form of their own. */
function Steps({ step, onSelect, ready }: { step: Step; onSelect: (step: Step) => void; ready: boolean }) {
  const t = useTranslations("admin.contests.new");

  return (
    <ol className="flex flex-wrap gap-2">
      {STEPS.map((candidate, index) => (
        <li key={candidate}>
          <button
            type="button"
            disabled={!ready && candidate !== "what"}
            onClick={() => onSelect(candidate)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm transition-colors",
              candidate === step
                ? "border-primary bg-row-selected text-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
              !ready && candidate !== "what" && "cursor-not-allowed opacity-50",
            )}
          >
            <span className="font-mono tabular-nums">{index + 1}</span> {t(`step.${candidate}`)}
          </button>
        </li>
      ))}
    </ol>
  );
}

/** Three common windows, because typing two datetimes is the slow part. */
function presets(t: ReturnType<typeof useTranslations>) {
  const atHour = (days: number, hour: number) => {
    const when = new Date();
    when.setDate(when.getDate() + days);
    when.setHours(hour, 0, 0, 0);

    return when.getTime();
  };

  return [
    {
      label: t("presetSaturday"),
      apply: () => {
        const today = new Date().getDay();
        const start = atHour((6 - today + 7) % 7 || 7, 10);

        return { startTime: start, endTime: start + 5 * HOUR };
      },
    },
    {
      label: t("presetTomorrow"),
      apply: () => {
        const start = atHour(1, 18);

        return { startTime: start, endTime: start + 2 * HOUR };
      },
    },
    {
      label: t("presetNow"),
      apply: () => {
        const start = Date.now();

        return { startTime: start, endTime: start + 3 * HOUR };
      },
    },
  ];
}
