"use client";

import { api } from "@convex/_generated/api";
import { Button, Checkbox, Field, Input, MultiSelect, Select } from "@moj/ui";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import {
  AdminCheckField,
  AdminForm,
  AdminFormError,
  AdminFormFooter,
  AdminSection,
  AdminShell,
  AdminWideField,
  DateTimeField,
  ReasonField,
  UserPicker,
} from "@/components/admin";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";

/** `ProblemAdmin`'s add form. The statement, test data and the rest of the tabs
 *  open once the problem exists, exactly as DMOJ's add-then-change flow does. */
export function NewProblemForm() {
  const t = useTranslations("admin.problems.new");
  const shared = useTranslations("admin.problems.shared");
  const commonActions = useTranslations("common.actions");
  const router = useRouter();
  const options = useQuery(api.pages.admin1.problemOptions, {});
  const viewer = useQuery(api.pages.admin1.consoleViewer, {});
  const create = useMutation(api.admin.problems.create);
  const ids = {
    code: useId(),
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
    date: useId(),
    visibility: useId(),
  };

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [points, setPoints] = useState("100");
  const [partial, setPartial] = useState(false);
  const [timeLimit, setTimeLimit] = useState("1");
  const [memoryLimit, setMemoryLimit] = useState("262144");
  const [shortCircuit, setShortCircuit] = useState(true);
  const [isPublic, setIsPublic] = useState(false);
  const [isManuallyManaged, setIsManuallyManaged] = useState(false);
  const [group, setGroup] = useState("uncategorized");
  const [types, setTypes] = useState<string[]>([]);
  const [license, setLicense] = useState("");
  const [languages, setLanguages] = useState<string[]>([]);
  const [organizations, setOrganizations] = useState<string[]>([]);
  const [authors, setAuthors] = useState<string[]>([]);
  const [curators, setCurators] = useState<string[]>([]);
  const [testers, setTesters] = useState<string[]>([]);
  const [sourceVisibility, setSourceVisibility] = useState("F");
  const [date, setDate] = useState<number | null>(Date.now());
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const permissions = viewer?.permissions;
  const allLanguageKeys = (options?.languages ?? []).map((row) => row.key);
  const allChecked = languages.length > 0 && languages.length === allLanguageKeys.length;

  async function submit() {
    setError(null);
    if (!/^[a-z.0-9]+$/.test(code) || code.length > 20) {
      setError(t("invalidCode"));
      return;
    }
    if (!name.trim()) {
      setError(t("nameRequired"));
      return;
    }
    setBusy(true);
    try {
      await create({
        code,
        name: name.trim(),
        description,
        points: Number(points) || 0,
        partial,
        timeLimit: Number(timeLimit) || 1,
        memoryLimit: Number(memoryLimit) || 262_144,
        shortCircuit,
        isPublic,
        isManuallyManaged,
        date: date ?? Date.now(),
        group,
        types: types.length > 0 ? types : undefined,
        licenseKey: license || undefined,
        allowedLanguages: languages.length > 0 ? languages : undefined,
        organizationSlugs: organizations.length > 0 ? organizations : undefined,
        authors: authors.length > 0 ? authors : undefined,
        curators: curators.length > 0 ? curators : undefined,
        testers: testers.length > 0 ? testers : undefined,
        submissionSourceVisibility: sourceVisibility as "A" | "S" | "O" | "F",
        reason: reason.trim() || undefined,
      });
      router.push(`/admin/problems/${code}/`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("createFailed"));
      setBusy(false);
    }
  }

  return (
    <AdminShell
      title={t("title")}
      breadcrumb={[
        { label: shared("consoleCrumb"), href: "/admin/" },
        { label: shared("problemsCrumb"), href: "/admin/problems/" },
        { label: t("crumb") },
      ]}
    >
      <AdminForm onSubmit={submit}>
        <AdminFormError message={error} />

        <AdminSection title={shared("panel.general")}>
          <Field label={shared("field.code")} htmlFor={ids.code} hint={t("codeHint")}>
            <Input
              id={ids.code}
              mono
              value={code}
              maxLength={20}
              onChange={(event) => setCode(event.target.value.toLowerCase())}
              placeholder={t("codePlaceholder")}
            />
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
          <Field label={shared("field.publishOn")} htmlFor={ids.date} hint={t("publishOnHint")}>
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
                disabled={permissions ? !permissions.changePublicVisibility : false}
                disabledReason={shared("missingPermission", {
                  permission: "judge.change_public_visibility",
                })}
              />
              <AdminCheckField
                label={shared("field.manuallyManaged")}
                hint={shared("field.manuallyManagedHint")}
                checked={isManuallyManaged}
                onCheckedChange={setIsManuallyManaged}
                disabled={permissions ? !permissions.changeManuallyManaged : false}
                disabledReason={shared("missingPermission", {
                  permission: "judge.change_manually_managed",
                })}
              />
            </div>
          </AdminWideField>
        </AdminSection>

        <AdminSection title={shared("panel.limits")}>
          <Field
            label={shared("field.timeLimit")}
            htmlFor={ids.timeLimit}
            hint={shared("field.timeLimitHint")}
          >
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
              placeholder={t("groupPlaceholder")}
            />
          </Field>
          <Field label={shared("field.types")} htmlFor={ids.types} optional={shared("optional")}>
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
              onValueChange={setSourceVisibility}
              options={[
                { value: "F", label: shared("field.sourceVisibilityFollow") },
                { value: "A", label: shared("field.sourceVisibilityAnyone") },
                { value: "S", label: shared("field.sourceVisibilitySolved") },
                { value: "O", label: shared("field.sourceVisibilityStaff") },
              ]}
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
          <Field label={shared("field.allowedLanguages")} hint={t("allowedLanguagesHint")}>
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

        <AdminSection title={shared("panel.statement")} columns={1}>
          <Field label={shared("field.statement")} hint={t("statementHint")}>
            <MarkdownEditor value={description} onChange={setDescription} preset="problem" />
          </Field>
        </AdminSection>

        <ReasonField value={reason} onChange={setReason} hint={t("reasonHint")} />

        <AdminFormFooter
          busy={busy}
          submitLabel={t("submit")}
          busyLabel={t("busy")}
          secondary={
            <Button asChild variant="secondary">
              <Link href="/admin/problems/">{commonActions("cancel")}</Link>
            </Button>
          }
        />
      </AdminForm>
    </AdminShell>
  );
}
