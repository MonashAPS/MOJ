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
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import { chosenValue } from "@/lib/choices";
import { formatDateTime } from "@/lib/format";
import { acknowledgedReason, ContestDangerDialog } from "./ContestDangerDialog";
import { ContestEntryFields } from "./ContestEntryFields";
import { ContestScheduleFields } from "./ContestScheduleFields";
import { ContestSummary } from "./ContestSummary";
import {
  argsFromFields,
  type ContestGeneralFields,
  changedArgs,
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

/** Numbering is gone from the site, so it is not offered here either; a contest
 *  still holding it reads as lettered, which is what it now renders as. */
const LABEL_SCHEME_OPTIONS = [
  { value: "letters", labelKey: "labelSchemeLetters" },
  { value: "custom", labelKey: "labelSchemeCustom" },
] as const;

/** `ContestAdmin.fieldsets`, every field, on one page with the reason at the end. */
export function ContestGeneralTab({
  contest,
  options,
}: {
  contest: ContestEdit;
  options: ContestOptions | undefined;
}) {
  const t = useTranslations("admin.contests.general");
  const scoring = useTranslations("contests.scoring");
  const warn = useTranslations("admin.contests.warnings");
  const update = useMutation(api.admin.contests.update);
  const formats = useQuery(api.contests.formats.list, {});

  const ids = {
    name: useId(),
    summary: useId(),
    start: useId(),
    end: useId(),
    timeLimit: useId(),
    format: useId(),
    formatConfig: useId(),
    labelScheme: useId(),
    customLabels: useId(),
    scoreboard: useId(),
    freeze: useId(),
    accessCode: useId(),
    contestants: useId(),
    organizations: useId(),
    classes: useId(),
    joinOrganizations: useId(),
    tags: useId(),
    locked: useId(),
    precision: useId(),
    ogImage: useId(),
    logo: useId(),
    rateExclude: useId(),
    banned: useId(),
    ratingFloor: useId(),
    ratingCeiling: useId(),
    performanceCeiling: useId(),
  };

  // One projection of the stored contest, which the controls are seeded from and
  // the save diffs against. Both sides of the comparison therefore read the row
  // the same way, so a field the form cannot represent exactly never looks
  // changed and never lands in the patch.
  const initial = useMemo(() => fieldsFromContest(contest), [contest]);

  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [summary, setSummary] = useState(initial.summary);
  const [startTime, setStartTime] = useState<number | null>(initial.startTime);
  const [endTime, setEndTime] = useState<number | null>(initial.endTime);
  const [timeLimit, setTimeLimit] = useState(initial.timeLimit);
  const [isVisible, setIsVisible] = useState(initial.isVisible);
  const [isRated, setIsRated] = useState(initial.isRated);
  const [ratingFloor, setRatingFloor] = useState(initial.ratingFloor);
  const [ratingCeiling, setRatingCeiling] = useState(initial.ratingCeiling);
  const [performanceCeiling, setPerformanceCeiling] = useState(initial.performanceCeiling);
  const [rateAll, setRateAll] = useState(initial.rateAll);
  const [rateExclude, setRateExclude] = useState<string[]>(initial.rateExclude);
  const [formatName, setFormatName] = useState(initial.formatName);
  const [formatConfig, setFormatConfig] = useState(initial.formatConfig);
  const [labelScheme, setLabelScheme] = useState(initial.labelScheme);
  const [customLabels, setCustomLabels] = useState(initial.customLabels);
  const [scoreboardVisibility, setScoreboardVisibility] = useState(initial.scoreboardVisibility);
  const [freezeMinutes, setFreezeMinutes] = useState(initial.freezeMinutes);
  const [blindDuringFreeze, setBlindDuringFreeze] = useState(initial.blindDuringFreeze);
  const [accessCode, setAccessCode] = useState(initial.accessCode);
  const [isPrivate, setIsPrivate] = useState(initial.isPrivate);
  const [privateContestants, setPrivateContestants] = useState<string[]>(initial.privateContestants);
  const [organizationSlugs, setOrganizationSlugs] = useState<string[]>(initial.organizationSlugs);
  const [classNames, setClassNames] = useState<string[]>(initial.classNames);
  const [isOrganizationPrivate, setIsOrganizationPrivate] = useState(initial.isOrganizationPrivate);
  const [joinOrganizationSlugs, setJoinOrganizationSlugs] = useState<string[]>(initial.joinOrganizationSlugs);
  const [tagNames, setTagNames] = useState<string[]>(initial.tagNames);
  const [lockedAfter, setLockedAfter] = useState<number | null>(initial.lockedAfter);
  const [pointsPrecision, setPointsPrecision] = useState(initial.pointsPrecision);
  const [hideProblemTags, setHideProblemTags] = useState(initial.hideProblemTags);
  const [disableLockdown, setHideNonContestProblems] = useState(initial.disableLockdown);
  const [hideProblemAuthors, setHideProblemAuthors] = useState(initial.hideProblemAuthors);
  const [runPretestsOnly, setRunPretestsOnly] = useState(initial.runPretestsOnly);
  const [showShortDisplay, setShowShortDisplay] = useState(initial.showShortDisplay);
  const [useClarifications, setUseClarifications] = useState(initial.useClarifications);
  const [ogImage, setOgImage] = useState(initial.ogImage);
  const [logoOverrideImage, setLogoOverrideImage] = useState(initial.logoOverrideImage);
  const [bannedUsers, setBannedUsers] = useState<string[]>(initial.bannedUsers);

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
    const text = formatConfig.trim();

    if (!text) return { ok: true as const, value: null };

    try {
      const value: unknown = JSON.parse(text);

      return { ok: true as const, value };
    } catch {
      return { ok: false as const, value: null };
    }
  }, [formatConfig]);

  const validation = useQuery(
    api.contests.formats.validate,
    parsedConfig.ok ? { name: formatName, config: parsedConfig.value } : "skip",
  );

  const described = useQuery(
    api.contests.formats.describe,
    parsedConfig.ok ? { name: formatName, config: parsedConfig.value } : "skip",
  );

  const refs = useResolvedRefs({
    usernames: [...privateContestants, ...rateExclude, ...bannedUsers],
    organizationSlugs,
    joinOrganizationSlugs,
    classNames,
    tagNames,
  });

  const permissions = contest.permissions;
  const configError = !parsedConfig.ok ? t("formatConfigInvalid") : (validation?.error ?? null);

  /** What the controls hold right now, in the same shape `initial` is in. */
  const current: ContestGeneralFields = {
    name,
    description,
    summary,
    startTime,
    endTime,
    timeLimit,
    isVisible,
    isRated,
    ratingFloor,
    ratingCeiling,
    performanceCeiling,
    rateAll,
    rateExclude,
    formatName,
    formatConfig,
    labelScheme,
    customLabels,
    scoreboardVisibility,
    freezeMinutes,
    blindDuringFreeze,
    accessCode,
    isPrivate,
    privateContestants,
    organizationSlugs,
    classNames,
    isOrganizationPrivate,
    joinOrganizationSlugs,
    tagNames,
    lockedAfter,
    pointsPrecision,
    hideProblemTags,
    disableLockdown,
    hideProblemAuthors,
    runPretestsOnly,
    showShortDisplay,
    useClarifications,
    ogImage,
    logoOverrideImage,
    bannedUsers,
  };

  const dirty = JSON.stringify(current) !== JSON.stringify(initial);

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

    const dangers = dangerWarnings(warnings);

    if (dangers.length > 0) {
      setConfirming(true);

      return;
    }

    await commit([]);
  }

  async function commit(acknowledged: readonly ContestWarning[]) {
    setConfirming(false);

    // The same refs on both sides, so a list that only changed because the
    // resolver answered does not read as an edit.
    const changed = changedArgs(
      argsFromFields(initial, refs, initialConfig),
      argsFromFields(current, refs, parsedConfig.value),
    );

    if (Object.keys(changed).length === 0) {
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

  /**
   * The draft as the settings shapes read it, so the summary describes what is
   * on screen rather than what is saved.
   */
  const describeSource = {
    startTime: startTime ?? contest.startTime,
    endTime: endTime ?? contest.endTime,
    timeLimit: timeLimit.trim() ? Number(timeLimit) * 60 : null,
    isVisible,
    isPrivate,
    isOrganizationPrivate,
    privateContestantProfileIds: privateContestants,
    organizationIds: organizationSlugs,
    classIds: classNames,
    limitJoinOrganizations: joinOrganizationSlugs.length > 0,
    joinOrganizationIds: joinOrganizationSlugs,
    freezeMinutes: Number(freezeMinutes) || 0,
    blindDuringFreeze,
    isRated,
    rateAll,
    rateExcludeProfileIds: rateExclude,
    ratingFloor: ratingFloor.trim() ? Number(ratingFloor) : null,
    ratingCeiling: ratingCeiling.trim() ? Number(ratingCeiling) : null,
    performanceCeilingOverride: performanceCeiling.trim() ? Number(performanceCeiling) : null,
    labelScheme,
    customLabels: customLabels
      .split(",")
      .map((label) => label.trim())
      .filter(Boolean),
    accessCode: accessCode.trim() || null,
    lockedAfter,
    runPretestsOnly,
  };

  const summaryLines = describeContest(describeSource, {
    moment: formatDateTime,
    duration: (millis) => t("minutes", { count: Math.round(millis / 60_000) }),
  });

  const warnings = contestWarnings(describeSource);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)] lg:items-start">
      <AdminForm onSubmit={save} dirty={dirty}>
        <AdminFormError message={error} />

        <AdminSection title={t("sectionGeneral")}>
          <Field label={t("key")}>
            <Input mono value={contest.key} readOnly disabled title={t("keyFixed")} />
          </Field>
          <Field label={t("name")} htmlFor={ids.name}>
            <Input id={ids.name} value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field
            label={t("summary")}
            htmlFor={ids.summary}
            optional={t("optional")}
            className="sm:col-span-2"
          >
            <Input
              id={ids.summary}
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              placeholder={t("summaryPlaceholder")}
            />
          </Field>
        </AdminSection>

        <Panel title={t("sectionDescription")} bodyClassName="p-4">
          <Field label={t("description")} hint={t("descriptionHint")}>
            <MarkdownEditor value={description} onChange={setDescription} preset="contest" rows={14} />
          </Field>
        </Panel>

        <AdminSection title={t("sectionScheduling")} columns={1}>
          <ContestScheduleFields
            startTime={startTime}
            endTime={endTime}
            windowMinutes={timeLimit}
            lockedAfter={lockedAfter}
            canLock={permissions.lockContest}
            lockDisabledReason={t("missingPermission", { permission: "judge.lock_contest" })}
            onChange={(patch) => {
              if (patch.startTime !== undefined) setStartTime(patch.startTime);

              if (patch.endTime !== undefined) setEndTime(patch.endTime);

              if (patch.windowMinutes !== undefined) setTimeLimit(patch.windowMinutes);

              if (patch.lockedAfter !== undefined) setLockedAfter(patch.lockedAfter);
            }}
          />
        </AdminSection>

        <AdminSection title={t("sectionSettings")}>
          <AdminWideField>
            <div className="grid gap-2 sm:grid-cols-3">
              <AdminCheckField
                label={t("clarifications")}
                hint={t("clarificationsHint")}
                checked={useClarifications}
                onCheckedChange={setUseClarifications}
              />
              <AdminCheckField
                label={t("hideProblemTags")}
                checked={hideProblemTags}
                onCheckedChange={setHideProblemTags}
              />
              <AdminCheckField
                label={t("hideProblemAuthors")}
                checked={hideProblemAuthors}
                onCheckedChange={setHideProblemAuthors}
              />
              <AdminCheckField
                label={t("disableLockdown")}
                hint={t("disableLockdownHint")}
                checked={disableLockdown}
                onCheckedChange={setHideNonContestProblems}
              />
              <AdminCheckField
                label={t("pretestsOnly")}
                hint={t("pretestsOnlyHint")}
                checked={runPretestsOnly}
                onCheckedChange={setRunPretestsOnly}
              />
              <AdminCheckField
                label={t("shortDisplay")}
                hint={t("shortDisplayHint")}
                checked={showShortDisplay}
                onCheckedChange={setShowShortDisplay}
              />
            </div>
          </AdminWideField>
          <Field label={t("scoreboardVisibility")} htmlFor={ids.scoreboard}>
            <Select
              id={ids.scoreboard}
              value={scoreboardVisibility}
              onValueChange={(value) =>
                setScoreboardVisibility(chosenValue(SCOREBOARD_OPTIONS, value, scoreboardVisibility))
              }
              options={SCOREBOARD_OPTIONS.map((option) => ({
                value: option.value,
                label: t(option.labelKey),
              }))}
            />
          </Field>
          <Field label={t("pointsPrecision")} htmlFor={ids.precision} hint={t("pointsPrecisionHint")}>
            <Input
              id={ids.precision}
              mono
              inputMode="numeric"
              value={pointsPrecision}
              onChange={(event) => setPointsPrecision(event.target.value)}
            />
          </Field>
        </AdminSection>

        <AdminSection title={t("sectionFreeze")}>
          <Field label={t("freeze")} htmlFor={ids.freeze} hint={t("freezeHint")}>
            <Input
              id={ids.freeze}
              mono
              inputMode="numeric"
              value={freezeMinutes}
              onChange={(event) => setFreezeMinutes(event.target.value)}
            />
          </Field>
          <AdminCheckField
            label={t("blindDuringFreeze")}
            hint={t("blindDuringFreezeHint")}
            checked={blindDuringFreeze}
            onCheckedChange={setBlindDuringFreeze}
          />
        </AdminSection>

        <AdminSection title={t("sectionFormat")}>
          <Field label={t("format")} htmlFor={ids.format}>
            <Select
              id={ids.format}
              value={formatName}
              onValueChange={(value) => {
                setFormatName(value);
                const chosen = (formats ?? []).find((row) => row.name === value);

                if (chosen) setFormatConfig(toJson(chosen.configDefaults));
              }}
              options={(formats ?? []).map((row) => ({ value: row.name, label: row.displayName }))}
            />
          </Field>
          <Field label={t("labelScheme")} htmlFor={ids.labelScheme}>
            <Select
              id={ids.labelScheme}
              value={labelScheme}
              onValueChange={(value) => setLabelScheme(chosenValue(LABEL_SCHEME_OPTIONS, value, labelScheme))}
              options={LABEL_SCHEME_OPTIONS.map((option) => ({
                value: option.value,
                label: t(option.labelKey),
              }))}
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
              value={formatConfig}
              onChange={(event) => setFormatConfig(event.target.value)}
              placeholder={'{\n  "penalty": 20\n}'}
            />
          </Field>
          {labelScheme === "custom" ? (
            <Field
              label={t("customLabels")}
              htmlFor={ids.customLabels}
              hint={t("customLabelsHint")}
              className="sm:col-span-2"
            >
              <Input
                id={ids.customLabels}
                mono
                value={customLabels}
                onChange={(event) => setCustomLabels(event.target.value)}
                placeholder="A1, A2, B1"
              />
            </Field>
          ) : null}
        </AdminSection>

        <AdminSection title={t("sectionRating")}>
          <AdminWideField>
            <div className="grid gap-2 sm:grid-cols-2">
              <AdminCheckField
                label={t("rated")}
                hint={t("ratedHint")}
                checked={isRated}
                onCheckedChange={setIsRated}
                disabled={!permissions.contestRating}
                disabledReason={t("missingPermission", { permission: "judge.contest_rating" })}
              />
              <AdminCheckField
                label={t("rateAll")}
                hint={t("rateAllHint")}
                checked={rateAll}
                onCheckedChange={setRateAll}
                disabled={!permissions.contestRating}
                disabledReason={t("missingPermission", { permission: "judge.contest_rating" })}
              />
            </div>
          </AdminWideField>
          <Field label={t("ratingFloor")} htmlFor={ids.ratingFloor} optional={t("optional")}>
            <Input
              id={ids.ratingFloor}
              mono
              inputMode="numeric"
              value={ratingFloor}
              onChange={(event) => setRatingFloor(event.target.value)}
            />
          </Field>
          <Field label={t("ratingCeiling")} htmlFor={ids.ratingCeiling} optional={t("optional")}>
            <Input
              id={ids.ratingCeiling}
              mono
              inputMode="numeric"
              value={ratingCeiling}
              onChange={(event) => setRatingCeiling(event.target.value)}
            />
          </Field>
          <Field label={t("performanceCeiling")} htmlFor={ids.performanceCeiling} optional={t("optional")}>
            <Input
              id={ids.performanceCeiling}
              mono
              inputMode="numeric"
              disabled={!permissions.overridePerformanceCeiling}
              title={
                permissions.overridePerformanceCeiling
                  ? undefined
                  : t("missingPermission", { permission: "judge.override_performance_ceiling" })
              }
              value={performanceCeiling}
              onChange={(event) => setPerformanceCeiling(event.target.value)}
            />
          </Field>
          <Field label={t("rateExclude")} htmlFor={ids.rateExclude} className="sm:col-span-2">
            <UserPicker
              id={ids.rateExclude}
              values={rateExclude}
              onChange={setRateExclude}
              disabled={!permissions.contestRating}
              disabledReason={t("missingPermission", { permission: "judge.contest_rating" })}
              ariaLabel={t("rateExclude")}
            />
          </Field>
        </AdminSection>

        <AdminSection title={t("sectionAccess")} columns={1}>
          <ContestEntryFields
            values={{
              isVisible,
              isPrivate,
              isOrganizationPrivate,
              privateContestants,
              organizationSlugs,
              classNames,
              joinOrganizationSlugs,
              accessCode,
            }}
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
            missingPermission={(permission) => t("missingPermission", { permission })}
            onChange={(patch) => {
              if (patch.isVisible !== undefined) setIsVisible(patch.isVisible);

              if (patch.isPrivate !== undefined) setIsPrivate(patch.isPrivate);

              if (patch.isOrganizationPrivate !== undefined) {
                setIsOrganizationPrivate(patch.isOrganizationPrivate);
              }

              if (patch.privateContestants !== undefined) setPrivateContestants(patch.privateContestants);

              if (patch.organizationSlugs !== undefined) setOrganizationSlugs(patch.organizationSlugs);

              if (patch.classNames !== undefined) setClassNames(patch.classNames);

              if (patch.joinOrganizationSlugs !== undefined) {
                setJoinOrganizationSlugs(patch.joinOrganizationSlugs);
              }

              if (patch.accessCode !== undefined) setAccessCode(patch.accessCode);
            }}
          />
        </AdminSection>

        <AdminSection title={t("sectionPresentation")}>
          <Field label={t("tags")} htmlFor={ids.tags} optional={t("optional")}>
            <MultiSelect
              id={ids.tags}
              values={tagNames}
              onChange={setTagNames}
              options={(options?.tags ?? []).map((row) => ({ value: row.name, label: row.name }))}
              placeholder={t("tagsPlaceholder")}
            />
          </Field>
          <Field label={t("ogImage")} htmlFor={ids.ogImage} optional={t("optional")}>
            <Input
              id={ids.ogImage}
              mono
              value={ogImage}
              onChange={(event) => setOgImage(event.target.value)}
              placeholder="https://"
            />
          </Field>
          <Field label={t("logoOverride")} htmlFor={ids.logo} optional={t("optional")}>
            <Input
              id={ids.logo}
              mono
              value={logoOverrideImage}
              onChange={(event) => setLogoOverrideImage(event.target.value)}
              placeholder="https://"
            />
          </Field>
        </AdminSection>

        <AdminSection title={t("sectionJustice")} columns={1}>
          <Field label={t("bannedUsers")} htmlFor={ids.banned} hint={t("bannedUsersHint")}>
            <UserPicker
              id={ids.banned}
              values={bannedUsers}
              onChange={setBannedUsers}
              ariaLabel={t("bannedUsers")}
            />
          </Field>
        </AdminSection>
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
