"use client";

import { api } from "@convex/_generated/api";
import { Checkbox, Field, Input, MultiSelect, Select, toast } from "@moj/ui";
import { useMutation } from "convex/react";
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
import type { ProblemEdit, ProblemOptions } from "./types";

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
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const permissions = problem.permissions;
  const allLanguageKeys = useMemo(() => (options?.languages ?? []).map((row) => row.key), [options]);
  const allChecked = allLanguageKeys.length > 0 && languages.length === allLanguageKeys.length;

  const ownershipDirty =
    !same(authors, problem.authors) ||
    !same(curators, problem.curators) ||
    !same(testers, problem.testers);
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
    if (!reason.trim()) {
      setReasonError("Say what you changed so the revision is worth reading.");
      return;
    }
    setReasonError(undefined);
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
      toast.success(
        result?.rescoreScheduled ? "Problem saved. A rescore was queued." : "Problem saved.",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The change was refused.");
    }
    setBusy(false);
  }

  return (
    <AdminForm onSubmit={save}>
      <AdminFormError message={error} />

      <AdminSection title="General">
        <Field label="Problem code">
          <Input mono value={problem.code} readOnly disabled title="A problem's code cannot change." />
        </Field>
        <Field label="Name" htmlFor={ids.name}>
          <Input id={ids.name} value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Points" htmlFor={ids.points}>
          <Input
            id={ids.points}
            mono
            inputMode="decimal"
            value={points}
            onChange={(event) => setPoints(event.target.value)}
          />
        </Field>
        <Field label="Publish on" htmlFor={ids.date}>
          <DateTimeField id={ids.date} value={date} onChange={setDate} ariaLabel="Publish on" />
        </Field>
        <AdminWideField>
          <div className="grid gap-2 sm:grid-cols-3">
            <AdminCheckField
              label="Partial scoring"
              hint="Score the cases that passed."
              checked={partial}
              onCheckedChange={setPartial}
            />
            <AdminCheckField
              label="Short circuit"
              hint="Stop at the first failed case."
              checked={shortCircuit}
              onCheckedChange={setShortCircuit}
            />
            <AdminCheckField
              label="Public"
              hint="Listed on /problems/ for everyone."
              checked={isPublic}
              onCheckedChange={setIsPublic}
              disabled={!permissions.changePublicVisibility && !problem.isOrganizationPrivate}
              disabledReason="You do not have judge.change_public_visibility."
            />
            <AdminCheckField
              label="Manually managed"
              hint="The judge will not grade it."
              checked={isManuallyManaged}
              onCheckedChange={setIsManuallyManaged}
              disabled={!permissions.changeManuallyManaged}
              disabledReason="You do not have judge.change_manually_managed."
            />
            <AdminCheckField
              label="Full markup"
              hint="Allow raw HTML in the statement."
              checked={isFullMarkup}
              onCheckedChange={setIsFullMarkup}
              disabled={!permissions.problemFullMarkup}
              disabledReason="You do not have judge.problem_full_markup."
            />
          </div>
        </AdminWideField>
      </AdminSection>

      <AdminSection title="Limits">
        <Field label="Time limit" htmlFor={ids.timeLimit} hint="Seconds.">
          <Input
            id={ids.timeLimit}
            mono
            inputMode="decimal"
            value={timeLimit}
            onChange={(event) => setTimeLimit(event.target.value)}
          />
        </Field>
        <Field label="Memory limit" htmlFor={ids.memoryLimit} hint="Kilobytes.">
          <Input
            id={ids.memoryLimit}
            mono
            inputMode="numeric"
            value={memoryLimit}
            onChange={(event) => setMemoryLimit(event.target.value)}
          />
        </Field>
      </AdminSection>

      <AdminSection title="Taxonomy">
        <Field label="Group" htmlFor={ids.group}>
          <Select
            id={ids.group}
            value={group}
            onValueChange={setGroup}
            options={(options?.groups ?? []).map((row) => ({ value: row.name, label: row.fullName }))}
          />
        </Field>
        <Field label="Types" htmlFor={ids.types}>
          <MultiSelect
            id={ids.types}
            values={types}
            onChange={setTypes}
            options={(options?.types ?? []).map((row) => ({ value: row.name, label: row.fullName }))}
            placeholder="Choose types"
          />
        </Field>
        <Field label="Licence" htmlFor={ids.license} optional=" (optional)">
          <Select
            id={ids.license}
            value={license}
            onValueChange={setLicense}
            options={(options?.licenses ?? []).map((row) => ({ value: row.key, label: row.name }))}
            placeholder="No licence"
          />
        </Field>
        <Field
          label="Submission source visibility"
          htmlFor={ids.visibility}
          hint="Who may read other people's code for this problem."
        >
          <Select
            id={ids.visibility}
            value={sourceVisibility}
            onValueChange={(value) => setSourceVisibility(value as ProblemEdit["submissionSourceVisibility"])}
            options={[
              { value: "F", label: "Follow the site default" },
              { value: "A", label: "Anyone" },
              { value: "S", label: "Users who solved it" },
              { value: "O", label: "Only the problem's staff" },
            ]}
          />
        </Field>
      </AdminSection>

      <AdminSection
        title="Languages"
        columns={1}
        action={
          <Checkbox
            id={ids.languages}
            label="Check all"
            labelClassName="text-xs"
            checked={allChecked}
            onCheckedChange={(checked) => setLanguages(checked ? allLanguageKeys : [])}
          />
        }
      >
        <Field
          label="Allowed languages"
          hint={`${languages.length} of ${allLanguageKeys.length} languages may be submitted in.`}
        >
          <MultiSelect
            values={languages}
            onChange={setLanguages}
            options={(options?.languages ?? []).map((row) => ({ value: row.key, label: row.name }))}
            placeholder="Every language"
            ariaLabel="Allowed languages"
          />
        </Field>
      </AdminSection>

      <AdminSection title="People">
        <Field label="Authors" htmlFor={ids.authors}>
          <UserPicker id={ids.authors} values={authors} onChange={setAuthors} ariaLabel="Authors" />
        </Field>
        <Field label="Curators" htmlFor={ids.curators}>
          <UserPicker id={ids.curators} values={curators} onChange={setCurators} ariaLabel="Curators" />
        </Field>
        <Field label="Testers" htmlFor={ids.testers}>
          <UserPicker id={ids.testers} values={testers} onChange={setTesters} ariaLabel="Testers" />
        </Field>
        <Field
          label="Organisations"
          htmlFor={ids.organizations}
          hint="Naming any organisation makes the problem private to them."
        >
          <MultiSelect
            id={ids.organizations}
            values={organizations}
            onChange={setOrganizations}
            options={(options?.organizations ?? []).map((row) => ({ value: row.slug, label: row.name }))}
            placeholder="Everyone"
          />
        </Field>
      </AdminSection>

      <AdminSection title="Justice" columns={1}>
        <Field
          label="Banned users"
          htmlFor={ids.banned}
          hint="These users cannot submit to this problem. Their existing submissions are kept."
        >
          <UserPicker id={ids.banned} values={banned} onChange={setBanned} ariaLabel="Banned users" />
        </Field>
      </AdminSection>

      <AdminSection title="Social">
        <Field label="Summary" htmlFor={ids.summary} optional=" (optional)">
          <Input id={ids.summary} value={summary} onChange={(event) => setSummary(event.target.value)} />
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
      </AdminSection>

      <ReasonField value={reason} onChange={setReason} error={reasonError} entity="problem" />
      <AdminFormFooter dirty={dirty} busy={busy} submitLabel="Save problem" />
    </AdminForm>
  );
}
