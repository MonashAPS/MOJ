"use client";

import { api } from "@convex/_generated/api";
import {
  blockingWarnings,
  type ContestWarning,
  contestWarnings,
  dangerWarnings,
  describeContest,
} from "@moj/core";
import { Field, Input, MultiSelect, Panel, Select, Textarea, toast } from "@moj/ui";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { useId, useMemo, useState } from "react";
import {
  AdminCheckField,
  AdminForm,
  AdminFormError,
  AdminFormFooter,
  AdminSection,
  AdminWideField,
  UserPicker,
  useResolvedRefs,
} from "@/components/admin";
import { useHumanDuration } from "@/components/contests/pieces";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import { chosenValue } from "@/lib/choices";
import { formatDateTime } from "@/lib/format";
import { acknowledgedReason, ContestDangerDialog } from "./ContestDangerDialog";
import { ContestEntryFields } from "./ContestEntryFields";
import { ContestScheduleFields } from "./ContestScheduleFields";
import { ContestFreezeFields, ContestRatingFields } from "./ContestScoringFields";
import { ContestSummary } from "./ContestSummary";
import {
  argsFromFields,
  type ContestGeneralFields,
  changedArgs,
  describeSourceOf,
  type FormatConfig,
  fieldsFromContest,
  toJson,
} from "./generalFields";
import type { ContestEdit, ContestOptions } from "./types";

const SCOREBOARD_OPTIONS = [
  { value: "V", labelKey: "scoreboardEveryone" },
  { value: "C", labelKey: "scoreboardUntilEnd" },
  { value: "P", labelKey: "scoreboardParticipants" },
  { value: "H", labelKey: "scoreboardNobody" },
] as const;

const LABEL_OPTIONS = [
  { value: "letters", labelKey: "labelSchemeLetters" },
  { value: "custom", labelKey: "labelSchemeCustom" },
] as const;

/** Which of the three settings tabs is on screen. */
export type SettingsTab = "setup" | "access" | "scoring";

/**
 * The three settings tabs are one form with one draft and one save, so a field
 * is only sent when it changed and the summary describes the whole contest
 * rather than the part on screen.
 */
export function ContestGeneralTab({
  contest,
  options,
  tab,
}: {
  contest: ContestEdit;
  options: ContestOptions | undefined;
  tab: SettingsTab;
}) {
  const on = (which: SettingsTab) => which === tab;

  const t = useTranslations("admin.contests.general");
  const scoring = useTranslations("contests.scoring");
  const warn = useTranslations("admin.contests.warnings");
  const humanDuration = useHumanDuration();
  const update = useMutation(api.admin.contests.update);
  const formats = useQuery(api.contests.formats.list, {});

  const ids = {
    name: useId(),
    summary: useId(),
    format: useId(),
    formatConfig: useId(),
    labels: useId(),
    customLabels: useId(),
    tags: useId(),
    precision: useId(),
    banned: useId(),
  };

  // One projection of the stored contest, which the draft is seeded from and
  // the save diffs against. Both sides of the comparison read the row the same
  // way, so a field the form cannot represent exactly never looks changed.
  const initial = useMemo(() => fieldsFromContest(contest), [contest]);
  const [draft, setDraft] = useState(initial);
  const change = (patch: Partial<ContestGeneralFields>) => setDraft((current) => ({ ...current, ...patch }));

  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialConfig = useMemo(() => {
    const text = initial.formatConfig.trim();

    if (!text) return null;

    try {
      // SAFETY: a format's config is `v.any()` and each format validates its own
      // shape, so `FormatConfig` is as narrow as this gets; the parse is only
      // here so the save compares configs by value rather than by whitespace.
      return JSON.parse(text) as FormatConfig;
    } catch {
      return null;
    }
  }, [initial.formatConfig]);

  const parsedConfig = useMemo(() => {
    const text = draft.formatConfig.trim();

    if (!text) return { ok: true as const, value: null };

    try {
      const value: unknown = JSON.parse(text);

      return { ok: true as const, value };
    } catch {
      return { ok: false as const, value: null };
    }
  }, [draft.formatConfig]);

  const validation = useQuery(
    api.contests.formats.validate,
    parsedConfig.ok ? { name: draft.formatName, config: parsedConfig.value } : "skip",
  );

  const described = useQuery(
    api.contests.formats.describe,
    parsedConfig.ok ? { name: draft.formatName, config: parsedConfig.value } : "skip",
  );

  const refs = useResolvedRefs({
    usernames: [...draft.namedUsers, ...draft.rateExclude, ...draft.bannedUsers],
    organizationSlugs: draft.organizationSlugs,
    joinOrganizationSlugs: draft.joinOrganizationSlugs,
    classNames: draft.classNames,
    tagNames: draft.tagNames,
  });

  const permissions = contest.permissions;
  const configError = !parsedConfig.ok ? t("formatConfigInvalid") : (validation?.error ?? null);

  // What a save would send. The same refs on both sides, so a list that only
  // changed because the resolver answered does not read as an edit, and a list
  // left behind by a mode that no longer reads it does not either.
  const changed = changedArgs(
    argsFromFields(initial, refs, initialConfig),
    argsFromFields(draft, refs, parsedConfig.value),
  );

  const dirty = Object.keys(changed).length > 0;

  const describeSource = describeSourceOf(draft, contest);
  const summaryLines = describeContest(describeSource, { moment: formatDateTime, duration: humanDuration });
  const warnings = contestWarnings(describeSource);

  /**
   * Validate, then either save or ask. A blocked warning is refused outright
   * because the server refuses it too; a danger is asked about once, because it
   * is legal and sometimes exactly what was wanted.
   */
  async function save() {
    setError(null);

    if (configError) {
      setError(configError);

      return;
    }

    // Every name has to have resolved. Saving through the window where they
    // have not wrote empty lists over populated ones.
    if (refs.blockedMessage) {
      setError(refs.blockedMessage);

      return;
    }

    const blocked = blockingWarnings(warnings);

    if (blocked[0]) {
      setError(warn(blocked[0].key, blocked[0].values));

      return;
    }

    if (dangerWarnings(warnings).length > 0) {
      setConfirming(true);

      return;
    }

    await commit([]);
  }

  async function commit(acknowledged: readonly ContestWarning[]) {
    setConfirming(false);

    if (!dirty) {
      toast.success(t("saved"));

      return;
    }

    setBusy(true);

    try {
      await update({
        key: contest.key,
        ...changed,
        reason: acknowledgedReason(reason, acknowledged),
      });
      setReason("");
      toast.success(t("saved"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("refused"));
    }

    setBusy(false);
  }

  const missingPermission = (permission: string) => t("missingPermission", { permission });

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)] lg:items-start">
      <AdminForm onSubmit={save} dirty={dirty}>
        <AdminFormError message={error} />

        {on("setup") ? (
          <AdminSection title={t("sectionGeneral")}>
            <Field label={t("key")}>
              <Input mono value={contest.key} readOnly disabled title={t("keyFixed")} />
            </Field>
            <Field label={t("name")} htmlFor={ids.name}>
              <Input
                id={ids.name}
                value={draft.name}
                onChange={(event) => change({ name: event.target.value })}
              />
            </Field>
            <Field
              label={t("summary")}
              htmlFor={ids.summary}
              optional={t("optional")}
              className="sm:col-span-2"
            >
              <Input
                id={ids.summary}
                value={draft.summary}
                onChange={(event) => change({ summary: event.target.value })}
                placeholder={t("summaryPlaceholder")}
              />
            </Field>
            <Field label={t("tags")} htmlFor={ids.tags} optional={t("optional")} className="sm:col-span-2">
              <MultiSelect
                id={ids.tags}
                values={draft.tagNames}
                onChange={(tagNames) => change({ tagNames })}
                options={(options?.tags ?? []).map((row) => ({ value: row.name, label: row.name }))}
                placeholder={t("tagsPlaceholder")}
              />
            </Field>
          </AdminSection>
        ) : null}

        {on("setup") ? (
          <Panel title={t("sectionDescription")} bodyClassName="p-4">
            <Field label={t("description")} hint={t("descriptionHint")}>
              <MarkdownEditor
                value={draft.description}
                onChange={(description) => change({ description })}
                preset="contest"
                rows={14}
              />
            </Field>
          </Panel>
        ) : null}

        {on("setup") ? (
          <AdminSection title={t("sectionScheduling")} columns={1}>
            <ContestScheduleFields
              startTime={draft.startTime}
              endTime={draft.endTime}
              windowMinutes={draft.windowMinutes}
              lockedAfter={draft.lockedAfter}
              canLock={permissions.lockContest}
              lockDisabledReason={missingPermission("judge.lock_contest")}
              onChange={change}
            />
          </AdminSection>
        ) : null}

        {on("setup") ? (
          <AdminSection title={t("sectionSettings")}>
            <AdminWideField>
              <div className="grid gap-2 sm:grid-cols-3">
                <AdminCheckField
                  label={t("clarifications")}
                  hint={t("clarificationsHint")}
                  checked={draft.useClarifications}
                  onCheckedChange={(useClarifications) => change({ useClarifications })}
                />
                <AdminCheckField
                  label={t("hideProblemTags")}
                  checked={draft.hideProblemTags}
                  onCheckedChange={(hideProblemTags) => change({ hideProblemTags })}
                />
                <AdminCheckField
                  label={t("hideProblemAuthors")}
                  checked={draft.hideProblemAuthors}
                  onCheckedChange={(hideProblemAuthors) => change({ hideProblemAuthors })}
                />
                <AdminCheckField
                  label={t("disableLockdown")}
                  hint={t("disableLockdownHint")}
                  checked={draft.disableLockdown}
                  onCheckedChange={(disableLockdown) => change({ disableLockdown })}
                />
                <AdminCheckField
                  label={t("proctorRequired")}
                  hint={t("proctorRequiredHint")}
                  checked={draft.proctorRequired}
                  onCheckedChange={(proctorRequired) => change({ proctorRequired })}
                />
                <AdminCheckField
                  label={t("pretestsOnly")}
                  hint={t("pretestsOnlyHint")}
                  checked={draft.runPretestsOnly}
                  onCheckedChange={(runPretestsOnly) => change({ runPretestsOnly })}
                />
              </div>
            </AdminWideField>
            <Field label={t("pointsPrecision")} htmlFor={ids.precision} hint={t("pointsPrecisionHint")}>
              <Input
                id={ids.precision}
                mono
                inputMode="numeric"
                value={draft.pointsPrecision}
                onChange={(event) => change({ pointsPrecision: event.target.value })}
              />
            </Field>
          </AdminSection>
        ) : null}

        {on("scoring") ? (
          <AdminSection title={t("sectionFreeze")} columns={1}>
            <ContestFreezeFields
              values={draft}
              scoreboardOptions={SCOREBOARD_OPTIONS.map((option) => ({
                value: option.value,
                label: t(option.labelKey),
              }))}
              onChange={({ scoreboardVisibility, ...patch }) =>
                change({
                  ...patch,
                  ...(scoreboardVisibility !== undefined && {
                    scoreboardVisibility: chosenValue(
                      SCOREBOARD_OPTIONS,
                      scoreboardVisibility,
                      draft.scoreboardVisibility,
                    ),
                  }),
                })
              }
            />
          </AdminSection>
        ) : null}

        {on("scoring") ? (
          <AdminSection title={t("sectionFormat")}>
            <Field label={t("format")} htmlFor={ids.format}>
              <Select
                id={ids.format}
                value={draft.formatName}
                onValueChange={(formatName) => {
                  const chosen = (formats ?? []).find((row) => row.name === formatName);
                  change({ formatName, ...(chosen && { formatConfig: toJson(chosen.configDefaults) }) });
                }}
                options={(formats ?? []).map((row) => ({ value: row.name, label: row.displayName }))}
              />
            </Field>
            <Field label={t("labelScheme")} htmlFor={ids.labels}>
              <Select
                id={ids.labels}
                value={draft.labels}
                onValueChange={(value) => change({ labels: chosenValue(LABEL_OPTIONS, value, draft.labels) })}
                options={LABEL_OPTIONS.map((option) => ({ value: option.value, label: t(option.labelKey) }))}
              />
            </Field>
            <Field
              label={t("formatConfig")}
              htmlFor={ids.formatConfig}
              error={configError ?? undefined}
              hint={
                described?.lines?.length
                  ? described.lines.map((line) => scoring(line.key, line.values)).join(" ")
                  : t("formatConfigHint")
              }
              className="sm:col-span-2"
            >
              <Textarea
                id={ids.formatConfig}
                mono
                rows={6}
                invalid={!!configError}
                value={draft.formatConfig}
                onChange={(event) => change({ formatConfig: event.target.value })}
                placeholder={'{\n  "penalty": 20\n}'}
              />
            </Field>
            {draft.labels === "custom" ? (
              <Field
                label={t("customLabels")}
                htmlFor={ids.customLabels}
                hint={t("customLabelsHint")}
                className="sm:col-span-2"
              >
                <Input
                  id={ids.customLabels}
                  mono
                  value={draft.customLabels}
                  onChange={(event) => change({ customLabels: event.target.value })}
                  placeholder="A1, A2, B1"
                />
              </Field>
            ) : null}
          </AdminSection>
        ) : null}

        {on("scoring") ? (
          <AdminSection title={t("sectionRating")} columns={1}>
            <ContestRatingFields
              values={draft}
              canRate={permissions.contestRating}
              canOverridePerformanceCeiling={permissions.overridePerformanceCeiling}
              missingPermission={missingPermission}
              onChange={change}
            />
          </AdminSection>
        ) : null}

        {on("access") ? (
          <AdminSection title={t("sectionAccess")} columns={1}>
            <ContestEntryFields
              values={draft}
              organizationOptions={(options?.organizations ?? []).map((row) => ({
                value: row.slug,
                label: row.name,
              }))}
              classOptions={(options?.classes ?? []).map((row) => ({
                value: row.name,
                label: row.organization ? `${row.name} (${row.organization})` : row.name,
              }))}
              canRestrict={permissions.createPrivateContest}
              canSetAccessCode={permissions.contestAccessCode}
              canChangeVisibility={permissions.changeContestVisibility}
              missingPermission={missingPermission}
              onChange={change}
            />
          </AdminSection>
        ) : null}

        {on("access") ? (
          <AdminSection title={t("sectionJustice")} columns={1}>
            <Field label={t("bannedUsers")} htmlFor={ids.banned} hint={t("bannedUsersHint")}>
              <UserPicker
                id={ids.banned}
                values={draft.bannedUsers}
                onChange={(bannedUsers) => change({ bannedUsers })}
                ariaLabel={t("bannedUsers")}
              />
            </Field>
          </AdminSection>
        ) : null}
        <AdminFormFooter busy={busy} submitLabel={t("submit")} />
      </AdminForm>

      <ContestSummary lines={summaryLines} warnings={warnings} dirty={dirty} />

      <ContestDangerDialog
        warnings={dangerWarnings(warnings)}
        open={confirming}
        onOpenChange={setConfirming}
        onConfirm={() => void commit(dangerWarnings(warnings))}
      />
    </div>
  );
}
