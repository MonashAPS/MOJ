"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
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
  DateTimeField,
  UserPicker,
} from "@/components/admin";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import type { ContestEdit, ContestOptions } from "./types";

function toJson(value: unknown): string {
  if (value === null || value === undefined) return "";

  return JSON.stringify(value, null, 2);
}

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

  const [name, setName] = useState(contest.name);
  const [description, setDescription] = useState(contest.description);
  const [summary, setSummary] = useState(contest.summary);
  const [startTime, setStartTime] = useState<number | null>(contest.startTime);
  const [endTime, setEndTime] = useState<number | null>(contest.endTime);

  const [timeLimit, setTimeLimit] = useState(
    contest.timeLimit === null ? "" : String(Math.round(contest.timeLimit / 60)),
  );

  const [isVisible, setIsVisible] = useState(contest.isVisible);
  const [isRated, setIsRated] = useState(contest.isRated);
  const [ratingFloor, setRatingFloor] = useState(contest.ratingFloor?.toString() ?? "");
  const [ratingCeiling, setRatingCeiling] = useState(contest.ratingCeiling?.toString() ?? "");

  const [performanceCeiling, setPerformanceCeiling] = useState(
    contest.performanceCeilingOverride?.toString() ?? "",
  );

  const [rateAll, setRateAll] = useState(contest.rateAll);
  const [rateExclude, setRateExclude] = useState<string[]>(contest.rateExclude);
  const [formatName, setFormatName] = useState(contest.formatName);
  const [formatConfig, setFormatConfig] = useState(toJson(contest.formatConfig));
  const [labelScheme, setLabelScheme] = useState(contest.labelScheme);
  const [customLabels, setCustomLabels] = useState(contest.customLabels.join(", "));
  const [scoreboardVisibility, setScoreboardVisibility] = useState(contest.scoreboardVisibility);
  const [freezeMinutes, setFreezeMinutes] = useState(String(contest.freezeMinutes));
  const [blindDuringFreeze, setBlindDuringFreeze] = useState(contest.blindDuringFreeze);
  const [accessCode, setAccessCode] = useState(contest.accessCode);
  const [isPrivate, setIsPrivate] = useState(contest.isPrivate);
  const [privateContestants, setPrivateContestants] = useState<string[]>(contest.privateContestants);
  const [organizationSlugs, setOrganizationSlugs] = useState<string[]>(contest.organizationSlugs);
  const [classNames, setClassNames] = useState<string[]>(contest.classNames);
  const [limitJoinOrganizations, setLimitJoinOrganizations] = useState(contest.limitJoinOrganizations);
  const [joinOrganizationSlugs, setJoinOrganizationSlugs] = useState<string[]>(contest.joinOrganizationSlugs);
  const [tagNames, setTagNames] = useState<string[]>(contest.tagNames);
  const [lockedAfter, setLockedAfter] = useState<number | null>(contest.lockedAfter);
  const [pointsPrecision, setPointsPrecision] = useState(String(contest.pointsPrecision));
  const [hideProblemTags, setHideProblemTags] = useState(contest.hideProblemTags);
  const [hideProblemAuthors, setHideProblemAuthors] = useState(contest.hideProblemAuthors);
  const [runPretestsOnly, setRunPretestsOnly] = useState(contest.runPretestsOnly);
  const [showShortDisplay, setShowShortDisplay] = useState(contest.showShortDisplay);
  const [useClarifications, setUseClarifications] = useState(contest.useClarifications);
  const [ogImage, setOgImage] = useState(contest.ogImage);
  const [logoOverrideImage, setLogoOverrideImage] = useState(contest.logoOverrideImage);
  const [bannedUsers, setBannedUsers] = useState<string[]>(contest.bannedUsers);

  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedConfig = useMemo(() => {
    const text = formatConfig.trim();

    if (!text) return { ok: true as const, value: null };

    try {
      return { ok: true as const, value: JSON.parse(text) as unknown };
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

  const usernames = [...privateContestants, ...rateExclude, ...bannedUsers];
  const profiles = useQuery(api.pages.admin.console.resolveProfiles, { usernames });

  const refs = useQuery(api.pages.admin.console.resolveContestRefs, {
    organizationSlugs,
    joinOrganizationSlugs,
    classNames,
    tagNames,
  });

  const permissions = contest.permissions;
  const configError = !parsedConfig.ok ? t("formatConfigInvalid") : (validation?.error ?? null);

  function idsFor(list: string[]): Id<"profiles">[] {
    const map = profiles?.ids ?? {};

    return list.map((username) => map[username]).filter((id): id is Id<"profiles"> => !!id);
  }

  async function save() {
    setError(null);

    if (configError) {
      setError(configError);

      return;
    }

    setBusy(true);

    try {
      await update({
        key: contest.key,
        name,
        description,
        summary: summary.trim() || null,
        startTime: startTime ?? contest.startTime,
        endTime: endTime ?? contest.endTime,
        timeLimit: timeLimit.trim() ? Number(timeLimit) * 60 : null,
        isVisible,
        isRated,
        ratingFloor: ratingFloor.trim() ? Number(ratingFloor) : null,
        ratingCeiling: ratingCeiling.trim() ? Number(ratingCeiling) : null,
        performanceCeilingOverride: performanceCeiling.trim() ? Number(performanceCeiling) : null,
        rateAll,
        rateExcludeProfileIds: idsFor(rateExclude),
        formatName,
        formatConfig: parsedConfig.value,
        labelScheme,
        customLabels: customLabels
          .split(",")
          .map((label) => label.trim())
          .filter(Boolean),
        scoreboardVisibility,
        freezeMinutes: Number(freezeMinutes) || 0,
        blindDuringFreeze,
        accessCode: accessCode.trim() || null,
        isPrivate,
        privateContestantProfileIds: idsFor(privateContestants),
        isOrganizationPrivate: organizationSlugs.length > 0 || classNames.length > 0,
        organizationIds: refs?.organizationIds ?? [],
        classIds: refs?.classIds ?? [],
        limitJoinOrganizations,
        joinOrganizationIds: refs?.joinOrganizationIds ?? [],
        tagIds: refs?.tagIds ?? [],
        lockedAfter,
        pointsPrecision: Number(pointsPrecision) || 0,
        hideProblemTags,
        hideProblemAuthors,
        runPretestsOnly,
        showShortDisplay,
        useClarifications,
        ogImage: ogImage.trim() || null,
        logoOverrideImage: logoOverrideImage.trim() || null,
        bannedProfileIds: idsFor(bannedUsers),
        reason: reason.trim(),
      });
      setReason("");
      toast.success(t("saved"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("refused"));
    }

    setBusy(false);
  }

  return (
    <AdminForm onSubmit={save}>
      <AdminFormError message={error} />

      <AdminSection title={t("sectionGeneral")}>
        <Field label={t("key")}>
          <Input mono value={contest.key} readOnly disabled title={t("keyFixed")} />
        </Field>
        <Field label={t("name")} htmlFor={ids.name}>
          <Input id={ids.name} value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label={t("summary")} htmlFor={ids.summary} optional={t("optional")} className="sm:col-span-2">
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

      <AdminSection title={t("sectionScheduling")}>
        <Field label={t("starts")} htmlFor={ids.start}>
          <DateTimeField id={ids.start} value={startTime} onChange={setStartTime} ariaLabel={t("start")} />
        </Field>
        <Field label={t("ends")} htmlFor={ids.end}>
          <DateTimeField id={ids.end} value={endTime} onChange={setEndTime} ariaLabel={t("end")} />
        </Field>
        <Field
          label={t("timeLimit")}
          htmlFor={ids.timeLimit}
          optional={t("optional")}
          hint={t("timeLimitHint")}
        >
          <Input
            id={ids.timeLimit}
            mono
            inputMode="numeric"
            value={timeLimit}
            onChange={(event) => setTimeLimit(event.target.value)}
            placeholder="180"
          />
        </Field>
        <Field
          label={t("lockedAfter")}
          htmlFor={ids.locked}
          optional={t("optional")}
          hint={t("lockedAfterHint")}
        >
          <DateTimeField
            id={ids.locked}
            value={lockedAfter}
            onChange={setLockedAfter}
            clearable
            ariaLabel={t("lockedAfter")}
            disabled={!permissions.lockContest}
          />
        </Field>
      </AdminSection>

      <AdminSection title={t("sectionSettings")}>
        <AdminWideField>
          <div className="grid gap-2 sm:grid-cols-3">
            <AdminCheckField
              label={t("visible")}
              hint={t("visibleHint")}
              checked={isVisible}
              onCheckedChange={setIsVisible}
              disabled={!permissions.changeContestVisibility}
              disabledReason={t("missingPermission", { permission: "judge.change_contest_visibility" })}
            />
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
            onValueChange={(value) => setScoreboardVisibility(value as ContestEdit["scoreboardVisibility"])}
            options={[
              { value: "V", label: t("scoreboardEveryone") },
              { value: "C", label: t("scoreboardUntilEnd") },
              { value: "P", label: t("scoreboardParticipants") },
              { value: "H", label: t("scoreboardNobody") },
            ]}
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
            onValueChange={(value) => setLabelScheme(value as ContestEdit["labelScheme"])}
            options={[
              { value: "letters", label: t("labelSchemeLetters") },
              { value: "numbers", label: t("labelSchemeNumbers") },
              { value: "custom", label: t("labelSchemeCustom") },
            ]}
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

      <AdminSection title={t("sectionAccess")}>
        <Field
          label={t("accessCode")}
          htmlFor={ids.accessCode}
          optional={t("optional")}
          hint={t("accessCodeHint")}
        >
          <Input
            id={ids.accessCode}
            mono
            value={accessCode}
            disabled={!permissions.contestAccessCode}
            title={
              permissions.contestAccessCode
                ? undefined
                : t("missingPermission", { permission: "judge.contest_access_code" })
            }
            onChange={(event) => setAccessCode(event.target.value)}
          />
        </Field>
        <AdminCheckField
          label={t("private")}
          hint={t("privateHint")}
          checked={isPrivate}
          onCheckedChange={setIsPrivate}
          disabled={!permissions.createPrivateContest}
          disabledReason={t("missingPermission", { permission: "judge.create_private_contest" })}
        />
        <Field label={t("privateContestants")} htmlFor={ids.contestants} className="sm:col-span-2">
          <UserPicker
            id={ids.contestants}
            values={privateContestants}
            onChange={setPrivateContestants}
            disabled={!permissions.createPrivateContest}
            disabledReason={t("missingPermission", { permission: "judge.create_private_contest" })}
            ariaLabel={t("privateContestants")}
          />
        </Field>
        <Field label={t("organizations")} htmlFor={ids.organizations} hint={t("organizationsHint")}>
          <div
            title={
              permissions.createPrivateContest
                ? undefined
                : t("missingPermission", { permission: "judge.create_private_contest" })
            }
          >
            <MultiSelect
              id={ids.organizations}
              values={organizationSlugs}
              onChange={setOrganizationSlugs}
              options={(options?.organizations ?? []).map((row) => ({ value: row.slug, label: row.name }))}
              placeholder={t("organizationsPlaceholder")}
              disabled={!permissions.createPrivateContest}
            />
          </div>
        </Field>
        <Field label={t("classes")} htmlFor={ids.classes} optional={t("optional")}>
          <MultiSelect
            id={ids.classes}
            values={classNames}
            onChange={setClassNames}
            options={(options?.classes ?? []).map((row) => ({
              value: row.name,
              label: row.organization ? `${row.name} (${row.organization})` : row.name,
            }))}
            placeholder={t("classesPlaceholder")}
          />
        </Field>
        <AdminCheckField
          label={t("limitJoin")}
          hint={t("limitJoinHint")}
          checked={limitJoinOrganizations}
          onCheckedChange={setLimitJoinOrganizations}
        />
        <Field label={t("joinOrganizations")} htmlFor={ids.joinOrganizations}>
          <MultiSelect
            id={ids.joinOrganizations}
            values={joinOrganizationSlugs}
            onChange={setJoinOrganizationSlugs}
            options={(options?.organizations ?? []).map((row) => ({ value: row.slug, label: row.name }))}
            placeholder={t("joinOrganizationsPlaceholder")}
          />
        </Field>
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
  );
}
