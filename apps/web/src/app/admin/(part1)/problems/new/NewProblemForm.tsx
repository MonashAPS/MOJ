"use client";

import { api } from "@convex/_generated/api";
import { Button, Checkbox, Field, Input, MultiSelect, Select } from "@moj/ui";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
      setError("Problem codes may only contain lowercase letters, digits and dots.");
      return;
    }
    if (!name.trim()) {
      setError("A problem needs a name.");
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
      setError(caught instanceof Error ? caught.message : "The problem could not be created.");
      setBusy(false);
    }
  }

  return (
    <AdminShell
      title="New problem"
      breadcrumb={[
        { label: "Staff console", href: "/admin/" },
        { label: "Problems", href: "/admin/problems/" },
        { label: "New" },
      ]}
    >
      <AdminForm onSubmit={submit}>
        <AdminFormError message={error} />

        <AdminSection title="General">
          <Field
            label="Problem code"
            htmlFor={ids.code}
            hint="Lowercase letters, digits and dots. This is the URL and the test-data folder name."
          >
            <Input
              id={ids.code}
              mono
              value={code}
              maxLength={20}
              onChange={(event) => setCode(event.target.value.toLowerCase())}
              placeholder="aplusb"
            />
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
          <Field
            label="Publish on"
            htmlFor={ids.date}
            hint="The problem stays hidden from the list until then."
          >
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
                disabled={permissions ? !permissions.changePublicVisibility : false}
                disabledReason="You do not have judge.change_public_visibility."
              />
              <AdminCheckField
                label="Manually managed"
                hint="The judge will not grade it."
                checked={isManuallyManaged}
                onCheckedChange={setIsManuallyManaged}
                disabled={permissions ? !permissions.changeManuallyManaged : false}
                disabledReason="You do not have judge.change_manually_managed."
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
              placeholder="Choose a group"
            />
          </Field>
          <Field label="Types" htmlFor={ids.types} optional=" (optional)">
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
              onValueChange={setSourceVisibility}
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
            hint="Leave every language checked unless the problem is language specific."
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

        <AdminSection title="Statement" columns={1}>
          <Field label="Statement" hint="Markdown, with ~math~ and $math$ both accepted.">
            <MarkdownEditor value={description} onChange={setDescription} preset="problem" />
          </Field>
        </AdminSection>

        <ReasonField value={reason} onChange={setReason} entity="problem" />

        <AdminFormFooter
          busy={busy}
          submitLabel="Create problem"
          busyLabel="Creating…"
          secondary={
            <Button asChild variant="secondary">
              <Link href="/admin/problems/">Cancel</Link>
            </Button>
          }
        />
      </AdminForm>
    </AdminShell>
  );
}
