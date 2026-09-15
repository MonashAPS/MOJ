"use client";

import { api } from "@convex/_generated/api";
import { Checkbox, Field, Input, MultiSelect, Select, toast } from "@moj/ui";
import { useMutation } from "convex/react";
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
import { chosenValue } from "@/lib/choices";
import type { ProblemEdit, ProblemOptions } from "./types";

const SOURCE_VISIBILITY_OPTIONS = [
  { value: "F", labelKey: "field.sourceVisibilityFollow" },
  { value: "A", labelKey: "field.sourceVisibilityAnyone" },
  { value: "S", labelKey: "field.sourceVisibilitySolved" },
  { value: "O", labelKey: "field.sourceVisibilityStaff" },
] as const;

function same(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** `ProblemAdmin.fieldsets`: the change form, minus the inlines, which are tabs. */
export function ProblemGeneralTab({
  problem,
  options,
}: {
  problem: ProblemEdit;
  options: ProblemOptions | undefined;
}) {
  const t = useTranslations("admin.problems.general");
  const shared = useTranslations("admin.problems.shared");
  const update = useMutation(api.admin.problems.update);
  const setOwnership = useMutation(api.admin.problems.setOwnership);
  const setBannedUsers = useMutation(api.admin.problems.setBannedUsers);

  const ids = {
    name: useId(),
    points: useId(),
    timeLimit: useId(),
    memoryLimit: useId(),
    group: useId(),
    types: useId(),
    license: useId(),
    languages: useId(),
    organizations: useId(),
    authors: useId(),
    curators: useId(),
    testers: useId(),
    banned: useId(),
    date: useId(),
    visibility: useId(),
    summary: useId(),
    ogImage: useId(),
  };

  const [name, setName] = useState(problem.name);
  const [points, setPoints] = useState(String(problem.points));
  const [partial, setPartial] = useState(problem.partial);
  const [timeLimit, setTimeLimit] = useState(String(problem.timeLimit));
  const [memoryLimit, setMemoryLimit] = useState(String(problem.memoryLimit));
  const [shortCircuit, setShortCircuit] = useState(problem.shortCircuit);
  const [isPublic, setIsPublic] = useState(problem.isPublic);
  const [isManuallyManaged, setIsManuallyManaged] = useState(problem.isManuallyManaged);
  const [isFullMarkup, setIsFullMarkup] = useState(problem.isFullMarkup);
  const [date, setDate] = useState<number | null>(problem.date);
  const [group, setGroup] = useState(problem.group ?? "uncategorized");
  const [types, setTypes] = useState<string[]>(problem.types);
  const [license, setLicense] = useState(problem.license ?? "");
  const [languages, setLanguages] = useState<string[]>(problem.allowedLanguages);
  const [organizations, setOrganizations] = useState<string[]>(problem.organizations);
  const [sourceVisibility, setSourceVisibility] = useState(problem.submissionSourceVisibility);
  const [authors, setAuthors] = useState<string[]>(problem.authors);
  const [curators, setCurators] = useState<string[]>(problem.curators);
  const [testers, setTesters] = useState<string[]>(problem.testers);
  const [banned, setBanned] = useState<string[]>(problem.bannedUsers);
  const [summary, setSummary] = useState(problem.summary);
  const [ogImage, setOgImage] = useState(problem.ogImage);

  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const permissions = problem.permissions;
  const allLanguageKeys = useMemo(() => (options?.languages ?? []).map((row) => row.key), [options]);
  const allChecked = allLanguageKeys.length > 0 && languages.length === allLanguageKeys.length;

  const ownershipDirty =
    !same(authors, problem.authors) || !same(curators, problem.curators) || !same(testers, problem.testers);

  const bannedDirty = !same(banned, problem.bannedUsers);

  const dirty =
    ownershipDirty ||
    bannedDirty ||
    name !== problem.name ||
    Number(points) !== problem.points ||
    partial !== problem.partial ||
    Number(timeLimit) !== problem.timeLimit ||
    Number(memoryLimit) !== problem.memoryLimit ||
    shortCircuit !== problem.shortCircuit ||
    isPublic !== problem.isPublic ||
    isManuallyManaged !== problem.isManuallyManaged ||
    isFullMarkup !== problem.isFullMarkup ||
    date !== problem.date ||
    group !== (problem.group ?? "uncategorized") ||
    !same(types, problem.types) ||
    license !== (problem.license ?? "") ||
    !same(languages, problem.allowedLanguages) ||
    !same(organizations, problem.organizations) ||
    sourceVisibility !== problem.submissionSourceVisibility ||
    summary !== problem.summary ||
    ogImage !== problem.ogImage;

  async function save() {
    setError(null);
    setBusy(true);

    try {
      const result = await update({
        code: problem.code,
        name,
        points: Number(points) || 0,
        partial,
        timeLimit: Number(timeLimit) || 1,
        memoryLimit: Number(memoryLimit) || 1,
        shortCircuit,
        isPublic,
        isManuallyManaged,
        isFullMarkup,
        date: date ?? problem.date,
        group,
        types,
        licenseKey: license || null,
        allowedLanguages: languages,
        organizationSlugs: organizations,
        submissionSourceVisibility: sourceVisibility,
        summary: summary.trim() || null,
        ogImage: ogImage.trim() || null,
        reason: reason.trim(),
      });

      if (ownershipDirty) {
        await setOwnership({ code: problem.code, authors, curators, testers, reason: reason.trim() });
      }

      if (bannedDirty) {
        await setBannedUsers({ code: problem.code, usernames: banned, reason: reason.trim() });
      }

      setReason("");
      toast.success(result?.rescoreScheduled ? t("savedRescoreQueued") : t("saved"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : shared("changeRefused"));
    }

    setBusy(false);
  }

  return (
    <AdminForm onSubmit={save}>
      <AdminFormError message={error} />

      <AdminSection title={shared("panel.general")}>
        <Field label={shared("field.code")}>
          <Input mono value={problem.code} readOnly disabled title={t("codeLocked")} />
        </Field>
        <Field label={shared("field.name")} htmlFor={ids.name}>
          <Input id={ids.name} value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label={shared("field.points")} htmlFor={ids.points}>
          <Input
            id={ids.points}
            mono
            inputMode="decimal"
            value={points}
            onChange={(event) => setPoints(event.target.value)}
          />
        </Field>
        <Field label={shared("field.publishOn")} htmlFor={ids.date}>
          <DateTimeField
            id={ids.date}
            value={date}
            onChange={setDate}
            ariaLabel={shared("field.publishOn")}
          />
        </Field>
        <AdminWideField>
          <div className="grid gap-2 sm:grid-cols-3">
            <AdminCheckField
              label={shared("field.partial")}
              hint={shared("field.partialHint")}
              checked={partial}
              onCheckedChange={setPartial}
            />
            <AdminCheckField
              label={shared("field.shortCircuit")}
              hint={shared("field.shortCircuitHint")}
              checked={shortCircuit}
              onCheckedChange={setShortCircuit}
            />
            <AdminCheckField
              label={shared("field.public")}
              hint={shared("field.publicHint")}
              checked={isPublic}
              onCheckedChange={setIsPublic}
              disabled={!permissions.changePublicVisibility && !problem.isOrganizationPrivate}
              disabledReason={shared("missingPermission", { permission: "judge.change_public_visibility" })}
            />
            <AdminCheckField
              label={shared("field.manuallyManaged")}
              hint={shared("field.manuallyManagedHint")}
              checked={isManuallyManaged}
              onCheckedChange={setIsManuallyManaged}
              disabled={!permissions.changeManuallyManaged}
              disabledReason={shared("missingPermission", { permission: "judge.change_manually_managed" })}
            />
            <AdminCheckField
              label={t("fullMarkup")}
              hint={t("fullMarkupHint")}
              checked={isFullMarkup}
              onCheckedChange={setIsFullMarkup}
              disabled={!permissions.problemFullMarkup}
              disabledReason={shared("missingPermission", { permission: "judge.problem_full_markup" })}
            />
          </div>
        </AdminWideField>
      </AdminSection>

      <AdminSection title={shared("panel.limits")}>
        <Field label={shared("field.timeLimit")} htmlFor={ids.timeLimit} hint={shared("field.timeLimitHint")}>
          <Input
            id={ids.timeLimit}
            mono
            inputMode="decimal"
            value={timeLimit}
            onChange={(event) => setTimeLimit(event.target.value)}
          />
        </Field>
        <Field
          label={shared("field.memoryLimit")}
          htmlFor={ids.memoryLimit}
          hint={shared("field.memoryLimitHint")}
        >
          <Input
            id={ids.memoryLimit}
            mono
            inputMode="numeric"
            value={memoryLimit}
            onChange={(event) => setMemoryLimit(event.target.value)}
          />
        </Field>
      </AdminSection>

      <AdminSection title={shared("panel.taxonomy")}>
        <Field label={shared("field.group")} htmlFor={ids.group}>
          <Select
            id={ids.group}
            value={group}
            onValueChange={setGroup}
            options={(options?.groups ?? []).map((row) => ({ value: row.name, label: row.fullName }))}
          />
        </Field>
        <Field label={shared("field.types")} htmlFor={ids.types}>
          <MultiSelect
            id={ids.types}
            values={types}
            onChange={setTypes}
            options={(options?.types ?? []).map((row) => ({ value: row.name, label: row.fullName }))}
            placeholder={shared("field.typesPlaceholder")}
          />
        </Field>
        <Field label={shared("field.license")} htmlFor={ids.license} optional={shared("optional")}>
          <Select
            id={ids.license}
            value={license}
            onValueChange={setLicense}
            options={(options?.licenses ?? []).map((row) => ({ value: row.key, label: row.name }))}
            placeholder={shared("field.licensePlaceholder")}
          />
        </Field>
        <Field
          label={shared("field.sourceVisibility")}
          htmlFor={ids.visibility}
          hint={shared("field.sourceVisibilityHint")}
        >
          <Select
            id={ids.visibility}
            value={sourceVisibility}
            onValueChange={(value) =>
              setSourceVisibility(chosenValue(SOURCE_VISIBILITY_OPTIONS, value, sourceVisibility))
            }
            options={SOURCE_VISIBILITY_OPTIONS.map((option) => ({
              value: option.value,
              label: shared(option.labelKey),
            }))}
          />
        </Field>
      </AdminSection>

      <AdminSection
        title={shared("panel.languages")}
        columns={1}
        action={
          <Checkbox
            id={ids.languages}
            label={shared("field.checkAll")}
            labelClassName="text-xs"
            checked={allChecked}
            onCheckedChange={(checked) => setLanguages(checked ? allLanguageKeys : [])}
          />
        }
      >
        <Field
          label={shared("field.allowedLanguages")}
          hint={t("allowedLanguagesHint", { count: languages.length, total: allLanguageKeys.length })}
        >
          <MultiSelect
            values={languages}
            onChange={setLanguages}
            options={(options?.languages ?? []).map((row) => ({ value: row.key, label: row.name }))}
            placeholder={shared("field.everyLanguage")}
            ariaLabel={shared("field.allowedLanguages")}
          />
        </Field>
      </AdminSection>

      <AdminSection title={shared("panel.people")}>
        <Field label={shared("field.authors")} htmlFor={ids.authors}>
          <UserPicker
            id={ids.authors}
            values={authors}
            onChange={setAuthors}
            ariaLabel={shared("field.authors")}
          />
        </Field>
        <Field label={shared("field.curators")} htmlFor={ids.curators}>
          <UserPicker
            id={ids.curators}
            values={curators}
            onChange={setCurators}
            ariaLabel={shared("field.curators")}
          />
        </Field>
        <Field label={shared("field.testers")} htmlFor={ids.testers}>
          <UserPicker
            id={ids.testers}
            values={testers}
            onChange={setTesters}
            ariaLabel={shared("field.testers")}
          />
        </Field>
        <Field
          label={shared("field.organizations")}
          htmlFor={ids.organizations}
          hint={shared("field.organizationsHint")}
        >
          <MultiSelect
            id={ids.organizations}
            values={organizations}
            onChange={setOrganizations}
            options={(options?.organizations ?? []).map((row) => ({ value: row.slug, label: row.name }))}
            placeholder={shared("field.everyone")}
          />
        </Field>
      </AdminSection>

      <AdminSection title={t("justicePanel")} columns={1}>
        <Field label={t("bannedUsers")} htmlFor={ids.banned} hint={t("bannedUsersHint")}>
          <UserPicker id={ids.banned} values={banned} onChange={setBanned} ariaLabel={t("bannedUsers")} />
        </Field>
      </AdminSection>

      <AdminSection title={t("socialPanel")}>
        <Field label={t("summary")} htmlFor={ids.summary} optional={shared("optional")}>
          <Input id={ids.summary} value={summary} onChange={(event) => setSummary(event.target.value)} />
        </Field>
        <Field label={t("socialImage")} htmlFor={ids.ogImage} optional={shared("optional")}>
          <Input
            id={ids.ogImage}
            mono
            value={ogImage}
            onChange={(event) => setOgImage(event.target.value)}
            placeholder="https://"
          />
        </Field>
      </AdminSection>
      <AdminFormFooter dirty={dirty} busy={busy} submitLabel={t("submit")} />
    </AdminForm>
  );
}
