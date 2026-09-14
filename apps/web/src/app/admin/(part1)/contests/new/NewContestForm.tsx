"use client";

import { api } from "@convex/_generated/api";
import { Button, Field, Input, Select } from "@moj/ui";
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
  DateTimeField,
  ReasonField,
} from "@/components/admin";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";

const HOUR = 3600_000;

/** The add form. Everything else — problems, people, rating — opens once the
 *  contest exists, the same two-step DMOJ's admin uses. */
export function NewContestForm() {
  const t = useTranslations("admin.contests.new");
  const actions = useTranslations("common.actions");
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
      setError(t("errorKey"));
      return;
    }
    if (!name.trim()) {
      setError(t("errorName"));
      return;
    }
    if (!startTime || !endTime || endTime <= startTime) {
      setError(t("errorWindow"));
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
      setError(caught instanceof Error ? caught.message : t("errorCreate"));
      setBusy(false);
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
      <AdminForm onSubmit={submit}>
        <AdminFormError message={error} />

        <AdminSection title={t("sectionGeneral")}>
          <Field label={t("key")} htmlFor={ids.key} hint={t("keyHint")}>
            <Input
              id={ids.key}
              mono
              maxLength={20}
              value={key}
              onChange={(event) => setKey(event.target.value.toLowerCase())}
              placeholder={t("keyPlaceholder")}
            />
          </Field>
          <Field label={t("name")} htmlFor={ids.name}>
            <Input id={ids.name} value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label={t("starts")} htmlFor={ids.start}>
            <DateTimeField id={ids.start} value={startTime} onChange={setStartTime} ariaLabel={t("start")} />
          </Field>
          <Field label={t("ends")} htmlFor={ids.end}>
            <DateTimeField id={ids.end} value={endTime} onChange={setEndTime} ariaLabel={t("end")} />
          </Field>
          <Field label={t("format")} htmlFor={ids.format}>
            <Select
              id={ids.format}
              value={formatName}
              onValueChange={setFormatName}
              options={(formats ?? []).map((row) => ({ value: row.name, label: row.displayName }))}
            />
          </Field>
          <Field label={t("freeze")} htmlFor={ids.freeze} hint={t("freezeHint")}>
            <Input
              id={ids.freeze}
              mono
              inputMode="numeric"
              value={freezeMinutes}
              onChange={(event) => setFreezeMinutes(event.target.value)}
            />
          </Field>
        </AdminSection>

        <AdminSection title={t("sectionSettings")}>
          <AdminCheckField
            label={t("visible")}
            hint={t("visibleHint")}
            checked={isVisible}
            onCheckedChange={setIsVisible}
          />
          <AdminCheckField
            label={t("rated")}
            hint={t("ratedHint")}
            checked={isRated}
            onCheckedChange={setIsRated}
          />
          <AdminCheckField
            label={t("clarifications")}
            hint={t("clarificationsHint")}
            checked={useClarifications}
            onCheckedChange={setUseClarifications}
          />
        </AdminSection>

        <AdminSection title={t("sectionDescription")} columns={1}>
          <Field label={t("description")} hint={t("descriptionHint")}>
            <MarkdownEditor value={description} onChange={setDescription} preset="contest" rows={10} />
          </Field>
        </AdminSection>

        <ReasonField value={reason} onChange={setReason} hint={t("reasonHint")} />
        <AdminFormFooter
          busy={busy}
          submitLabel={t("submit")}
          busyLabel={t("submitBusy")}
          secondary={
            <Button asChild variant="secondary">
              <Link href="/admin/contests/">{actions("cancel")}</Link>
            </Button>
          }
        />
      </AdminForm>
    </AdminShell>
  );
}
