"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Field, Input, MultiSelect, Panel, Select, Textarea, toast } from "@moj/ui";
import { useMutation, useQuery } from "convex/react";
import { useId, useMemo, useState } from "react";
import {
  AdminCheckField,
  AdminForm,
  AdminFormError,
  AdminFormFooter,
  AdminSection,
  AdminWideField,
  DateTimeField,
  ReasonField,
  UserPicker,
} from "@/components/admin";
import { useConsoleQuery } from "@/components/admin/useConsoleQuery";
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
  const update = useMutation(api.admin.contests.update);
  const formats = useQuery(api.contestFormats.list, {});

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
  const [reasonError, setReasonError] = useState<string | undefined>();
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
    api.contestFormats.validate,
    parsedConfig.ok ? { name: formatName, config: parsedConfig.value } : "skip",
  );
  const described = useQuery(
    api.contestFormats.describe,
    parsedConfig.ok ? { name: formatName, config: parsedConfig.value } : "skip",
  );

  const usernames = [...privateContestants, ...rateExclude, ...bannedUsers];
  const profiles = useConsoleQuery(api.pages.admin1.resolveProfiles, { usernames }).data;
  const refs = useConsoleQuery(api.pages.admin1.resolveContestRefs, {
    organizationSlugs,
    joinOrganizationSlugs,
    classNames,
    tagNames,
  }).data;

  const permissions = contest.permissions;
  const configError = !parsedConfig.ok ? "That is not valid JSON." : (validation?.error ?? null);

  function idsFor(list: string[]): Id<"profiles">[] {
    const map = profiles?.ids ?? {};
    return list.map((username) => map[username]).filter((id): id is Id<"profiles"> => !!id);
  }

  async function save() {
    setError(null);
    if (!reason.trim()) {
      setReasonError("Say what you changed so the revision is worth reading.");
      return;
    }
    if (configError) {
      setError(configError);
      return;
    }
    setReasonError(undefined);
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
      toast.success("Contest saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The change was refused.");
    }
    setBusy(false);
  }

  return (
    <AdminForm onSubmit={save}>
      <AdminFormError message={error} />

      <AdminSection title="General">
        <Field label="Contest id">
          <Input mono value={contest.key} readOnly disabled title="A contest's id cannot change." />
        </Field>
        <Field label="Name" htmlFor={ids.name}>
          <Input id={ids.name} value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Summary" htmlFor={ids.summary} optional=" (optional)" className="sm:col-span-2">
          <Input
            id={ids.summary}
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            placeholder="One line, used in listings and link previews"
          />
        </Field>
      </AdminSection>

      <Panel title="Description" bodyClassName="p-4">
        <Field label="Description" hint="Markdown, shown on the contest's own page.">
          <MarkdownEditor value={description} onChange={setDescription} preset="contest" rows={14} />
        </Field>
      </Panel>

      <AdminSection title="Scheduling">
        <Field label="Starts" htmlFor={ids.start}>
          <DateTimeField id={ids.start} value={startTime} onChange={setStartTime} ariaLabel="Start" />
        </Field>
        <Field label="Ends" htmlFor={ids.end}>
          <DateTimeField id={ids.end} value={endTime} onChange={setEndTime} ariaLabel="End" />
        </Field>
        <Field
          label="Time limit"
          htmlFor={ids.timeLimit}
          optional=" (optional)"
          hint="Minutes each contestant gets from when they join. Empty means the whole window."
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
          label="Locked after"
          htmlFor={ids.locked}
          optional=" (optional)"
          hint="Submissions stop being editable and rejudgeable after this moment."
        >
          <DateTimeField
            id={ids.locked}
            value={lockedAfter}
            onChange={setLockedAfter}
            clearable
            ariaLabel="Locked after"
            disabled={!permissions.lockContest}
          />
        </Field>
      </AdminSection>

      <AdminSection title="Settings">
        <AdminWideField>
          <div className="grid gap-2 sm:grid-cols-3">
            <AdminCheckField
              label="Visible"
              hint="Listed on /contests/."
              checked={isVisible}
              onCheckedChange={setIsVisible}
              disabled={!permissions.changeContestVisibility}
              disabledReason="You do not have judge.change_contest_visibility."
            />
            <AdminCheckField
              label="Clarifications"
              hint="Contestants may ask questions."
              checked={useClarifications}
              onCheckedChange={setUseClarifications}
            />
            <AdminCheckField
              label="Hide problem tags"
              checked={hideProblemTags}
              onCheckedChange={setHideProblemTags}
            />
            <AdminCheckField
              label="Hide problem authors"
              checked={hideProblemAuthors}
              onCheckedChange={setHideProblemAuthors}
            />
            <AdminCheckField
              label="Pretests only"
              hint="Grade against pretests during the contest."
              checked={runPretestsOnly}
              onCheckedChange={setRunPretestsOnly}
            />
            <AdminCheckField
              label="Short display"
              hint="Compact scoreboard cells."
              checked={showShortDisplay}
              onCheckedChange={setShowShortDisplay}
            />
          </div>
        </AdminWideField>
        <Field label="Scoreboard visibility" htmlFor={ids.scoreboard}>
          <Select
            id={ids.scoreboard}
            value={scoreboardVisibility}
            onValueChange={(value) => setScoreboardVisibility(value as ContestEdit["scoreboardVisibility"])}
            options={[
              { value: "V", label: "Visible to everyone" },
              { value: "C", label: "Hidden until the contest ends" },
              { value: "P", label: "Visible to participants only" },
              { value: "H", label: "Hidden from everyone" },
            ]}
          />
        </Field>
        <Field label="Points precision" htmlFor={ids.precision} hint="Decimal places on the scoreboard.">
          <Input
            id={ids.precision}
            mono
            inputMode="numeric"
            value={pointsPrecision}
            onChange={(event) => setPointsPrecision(event.target.value)}
          />
        </Field>
      </AdminSection>

      <AdminSection title="Freeze">
        <Field
          label="Freeze"
          htmlFor={ids.freeze}
          hint="Minutes before the end that the public scoreboard stops updating. 0 means no freeze."
        >
          <Input
            id={ids.freeze}
            mono
            inputMode="numeric"
            value={freezeMinutes}
            onChange={(event) => setFreezeMinutes(event.target.value)}
          />
        </Field>
        <AdminCheckField
          label="Blind during the freeze"
          hint="Contestants see 'pending' instead of their own verdicts until the contest ends."
          checked={blindDuringFreeze}
          onCheckedChange={setBlindDuringFreeze}
        />
      </AdminSection>

      <AdminSection title="Format">
        <Field label="Format" htmlFor={ids.format}>
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
        <Field label="Problem labels" htmlFor={ids.labelScheme}>
          <Select
            id={ids.labelScheme}
            value={labelScheme}
            onValueChange={(value) => setLabelScheme(value as ContestEdit["labelScheme"])}
            options={[
              { value: "letters", label: "Letters (A, B, C)" },
              { value: "numbers", label: "Numbers (1, 2, 3)" },
              { value: "custom", label: "Custom" },
            ]}
          />
        </Field>
        <Field
          label="Format configuration"
          htmlFor={ids.formatConfig}
          error={configError ?? undefined}
          hint={
            described?.lines?.length
              ? described.lines.join(" ")
              : "JSON. Leave empty to use the format's defaults."
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
            label="Custom labels"
            htmlFor={ids.customLabels}
            hint="Comma separated, in problem order."
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

      <AdminSection title="Rating">
        <AdminWideField>
          <div className="grid gap-2 sm:grid-cols-2">
            <AdminCheckField
              label="Rated"
              hint="Ratings move when the contest is rated from the Actions tab."
              checked={isRated}
              onCheckedChange={setIsRated}
              disabled={!permissions.contestRating}
              disabledReason="You do not have judge.contest_rating."
            />
            <AdminCheckField
              label="Rate everyone"
              hint="Include participants who scored nothing."
              checked={rateAll}
              onCheckedChange={setRateAll}
              disabled={!permissions.contestRating}
              disabledReason="You do not have judge.contest_rating."
            />
          </div>
        </AdminWideField>
        <Field label="Rating floor" htmlFor={ids.ratingFloor} optional=" (optional)">
          <Input
            id={ids.ratingFloor}
            mono
            inputMode="numeric"
            value={ratingFloor}
            onChange={(event) => setRatingFloor(event.target.value)}
          />
        </Field>
        <Field label="Rating ceiling" htmlFor={ids.ratingCeiling} optional=" (optional)">
          <Input
            id={ids.ratingCeiling}
            mono
            inputMode="numeric"
            value={ratingCeiling}
            onChange={(event) => setRatingCeiling(event.target.value)}
          />
        </Field>
        <Field label="Performance ceiling override" htmlFor={ids.performanceCeiling} optional=" (optional)">
          <Input
            id={ids.performanceCeiling}
            mono
            inputMode="numeric"
            disabled={!permissions.overridePerformanceCeiling}
            title={
              permissions.overridePerformanceCeiling
                ? undefined
                : "You do not have judge.override_performance_ceiling."
            }
            value={performanceCeiling}
            onChange={(event) => setPerformanceCeiling(event.target.value)}
          />
        </Field>
        <Field label="Excluded from rating" htmlFor={ids.rateExclude} className="sm:col-span-2">
          <UserPicker
            id={ids.rateExclude}
            values={rateExclude}
            onChange={setRateExclude}
            disabled={!permissions.contestRating}
            disabledReason="You do not have judge.contest_rating."
            ariaLabel="Excluded from rating"
          />
        </Field>
      </AdminSection>

      <AdminSection title="Access">
        <Field
          label="Access code"
          htmlFor={ids.accessCode}
          optional=" (optional)"
          hint="Anyone with the code may join, even if the contest is private."
        >
          <Input
            id={ids.accessCode}
            mono
            value={accessCode}
            disabled={!permissions.contestAccessCode}
            title={permissions.contestAccessCode ? undefined : "You do not have judge.contest_access_code."}
            onChange={(event) => setAccessCode(event.target.value)}
          />
        </Field>
        <AdminCheckField
          label="Private"
          hint="Only the contestants named below may see it."
          checked={isPrivate}
          onCheckedChange={setIsPrivate}
          disabled={!permissions.createPrivateContest}
          disabledReason="You do not have judge.create_private_contest."
        />
        <Field label="Private contestants" htmlFor={ids.contestants} className="sm:col-span-2">
          <UserPicker
            id={ids.contestants}
            values={privateContestants}
            onChange={setPrivateContestants}
            disabled={!permissions.createPrivateContest}
            disabledReason="You do not have judge.create_private_contest."
            ariaLabel="Private contestants"
          />
        </Field>
        <Field
          label="Organisations"
          htmlFor={ids.organizations}
          hint="Naming any organisation makes the contest private to them."
        >
          <div
            title={
              permissions.createPrivateContest
                ? undefined
                : "You do not have judge.create_private_contest."
            }
          >
            <MultiSelect
              id={ids.organizations}
              values={organizationSlugs}
              onChange={setOrganizationSlugs}
              options={(options?.organizations ?? []).map((row) => ({ value: row.slug, label: row.name }))}
              placeholder="Everyone"
              disabled={!permissions.createPrivateContest}
            />
          </div>
        </Field>
        <Field label="Classes" htmlFor={ids.classes} optional=" (optional)">
          <MultiSelect
            id={ids.classes}
            values={classNames}
            onChange={setClassNames}
            options={(options?.classes ?? []).map((row) => ({
              value: row.name,
              label: row.organization ? `${row.name} (${row.organization})` : row.name,
            }))}
            placeholder="No class"
          />
        </Field>
        <AdminCheckField
          label="Limit who may join"
          hint="Only members of the organisations below may enter."
          checked={limitJoinOrganizations}
          onCheckedChange={setLimitJoinOrganizations}
        />
        <Field label="Organisations that may join" htmlFor={ids.joinOrganizations}>
          <MultiSelect
            id={ids.joinOrganizations}
            values={joinOrganizationSlugs}
            onChange={setJoinOrganizationSlugs}
            options={(options?.organizations ?? []).map((row) => ({ value: row.slug, label: row.name }))}
            placeholder="Anyone"
          />
        </Field>
      </AdminSection>

      <AdminSection title="Presentation">
        <Field label="Tags" htmlFor={ids.tags} optional=" (optional)">
          <MultiSelect
            id={ids.tags}
            values={tagNames}
            onChange={setTagNames}
            options={(options?.tags ?? []).map((row) => ({ value: row.name, label: row.name }))}
            placeholder="No tags"
          />
        </Field>
        <Field label="Social image" htmlFor={ids.ogImage} optional=" (optional)">
          <Input
            id={ids.ogImage}
            mono
            value={ogImage}
            onChange={(event) => setOgImage(event.target.value)}
            placeholder="https://"
          />
        </Field>
        <Field label="Logo override" htmlFor={ids.logo} optional=" (optional)">
          <Input
            id={ids.logo}
            mono
            value={logoOverrideImage}
            onChange={(event) => setLogoOverrideImage(event.target.value)}
            placeholder="https://"
          />
        </Field>
      </AdminSection>

      <AdminSection title="Justice" columns={1}>
        <Field
          label="Banned users"
          htmlFor={ids.banned}
          hint="They cannot join, and are dropped out of contest mode when this is saved."
        >
          <UserPicker
            id={ids.banned}
            values={bannedUsers}
            onChange={setBannedUsers}
            ariaLabel="Banned users"
          />
        </Field>
      </AdminSection>

      <ReasonField value={reason} onChange={setReason} error={reasonError} entity="contest" />
      <AdminFormFooter busy={busy} submitLabel="Save contest" />
    </AdminForm>
  );
}
