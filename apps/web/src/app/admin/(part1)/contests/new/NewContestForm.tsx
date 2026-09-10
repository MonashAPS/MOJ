"use client";

import { api } from "@convex/_generated/api";
import { Button, Field, Input, Select } from "@moj/ui";
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
  DateTimeField,
  ReasonField,
} from "@/components/admin";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";

const HOUR = 3600_000;

/** The add form. Everything else — problems, people, rating — opens once the
 *  contest exists, the same two-step DMOJ's admin uses. */
export function NewContestForm() {
  const router = useRouter();
  const create = useMutation(api.admin.contests.create);
  const formats = useQuery(api.contestFormats.list, {});

  const ids = { key: useId(), name: useId(), format: useId(), start: useId(), end: useId(), freeze: useId() };
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startTime, setStartTime] = useState<number | null>(Date.now() + HOUR);
  const [endTime, setEndTime] = useState<number | null>(Date.now() + 4 * HOUR);
  const [formatName, setFormatName] = useState("default");
  const [freezeMinutes, setFreezeMinutes] = useState("0");
  const [isVisible, setIsVisible] = useState(false);
  const [isRated, setIsRated] = useState(false);
  const [useClarifications, setUseClarifications] = useState(true);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!/^[a-z0-9]+$/.test(key) || key.length > 20) {
      setError("Contest id must be lowercase letters and digits, at most 20 characters.");
      return;
    }
    if (!name.trim()) {
      setError("A contest needs a name.");
      return;
    }
    if (!startTime || !endTime || endTime <= startTime) {
      setError("The contest must end after it starts.");
      return;
    }
    setBusy(true);
    try {
      const result = await create({
        key,
        name: name.trim(),
        startTime,
        endTime,
        description,
        formatName,
        freezeMinutes: Number(freezeMinutes) || 0,
        isVisible,
        isRated,
        useClarifications,
        reason: reason.trim() || undefined,
      });
      router.push(`/admin/contests/${result.key}/`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The contest could not be created.");
      setBusy(false);
    }
  }

  return (
    <AdminShell
      title="New contest"
      breadcrumb={[
        { label: "Staff console", href: "/admin/" },
        { label: "Contests", href: "/admin/contests/" },
        { label: "New" },
      ]}
    >
      <AdminForm onSubmit={submit}>
        <AdminFormError message={error} />

        <AdminSection title="General">
          <Field label="Contest id" htmlFor={ids.key} hint="Lowercase letters and digits. This is the URL.">
            <Input
              id={ids.key}
              mono
              maxLength={20}
              value={key}
              onChange={(event) => setKey(event.target.value.toLowerCase())}
              placeholder="mcpc26"
            />
          </Field>
          <Field label="Name" htmlFor={ids.name}>
            <Input id={ids.name} value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="Starts" htmlFor={ids.start}>
            <DateTimeField id={ids.start} value={startTime} onChange={setStartTime} ariaLabel="Start" />
          </Field>
          <Field label="Ends" htmlFor={ids.end}>
            <DateTimeField id={ids.end} value={endTime} onChange={setEndTime} ariaLabel="End" />
          </Field>
          <Field label="Format" htmlFor={ids.format}>
            <Select
              id={ids.format}
              value={formatName}
              onValueChange={setFormatName}
              options={(formats ?? []).map((row) => ({ value: row.name, label: row.displayName }))}
            />
          </Field>
          <Field
            label="Freeze"
            htmlFor={ids.freeze}
            hint="Minutes before the end that the public board stops updating."
          >
            <Input
              id={ids.freeze}
              mono
              inputMode="numeric"
              value={freezeMinutes}
              onChange={(event) => setFreezeMinutes(event.target.value)}
            />
          </Field>
        </AdminSection>

        <AdminSection title="Settings">
          <AdminCheckField
            label="Visible"
            hint="Leave this off until the problems are in."
            checked={isVisible}
            onCheckedChange={setIsVisible}
          />
          <AdminCheckField
            label="Rated"
            hint="Ratings only move once the contest is rated from Actions."
            checked={isRated}
            onCheckedChange={setIsRated}
          />
          <AdminCheckField
            label="Clarifications"
            hint="Contestants may ask questions."
            checked={useClarifications}
            onCheckedChange={setUseClarifications}
          />
        </AdminSection>

        <AdminSection title="Description" columns={1}>
          <Field label="Description" hint="Markdown, shown on the contest's own page.">
            <MarkdownEditor value={description} onChange={setDescription} preset="contest" rows={10} />
          </Field>
        </AdminSection>

        <ReasonField value={reason} onChange={setReason} entity="contest" />
        <AdminFormFooter
          busy={busy}
          submitLabel="Create contest"
          busyLabel="Creating…"
          secondary={
            <Button asChild variant="secondary">
              <Link href="/admin/contests/">Cancel</Link>
            </Button>
          }
        />
      </AdminForm>
    </AdminShell>
  );
}
