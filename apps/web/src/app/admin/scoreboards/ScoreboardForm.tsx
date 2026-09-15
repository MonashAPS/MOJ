"use client";

import { api } from "@convex/_generated/api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  EmptyState,
  Field,
  Input,
  MultiSelect,
  Select,
  toast,
} from "@moj/ui";
import { useMutation, useQuery } from "convex/react";
import { ExternalLink, FileQuestion } from "lucide-react";
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
} from "@/components/admin";

/** `scoreboardEvents`: the rows that replaced the fork's hard-coded scoreboard setting. */
export function ScoreboardForm({ eventKey }: { eventKey?: string }) {
  const t = useTranslations("admin.scoreboards.form");
  const shell = useTranslations("admin.shell");
  const list = useTranslations("admin.scoreboards.list");
  const actions = useTranslations("common.actions");
  const router = useRouter();
  const existing = useQuery(api.admin.scoreboards.get, eventKey ? { key: eventKey } : "skip");
  const options = useQuery(api.pages.admin.scoreboards.options, {});
  const create = useMutation(api.admin.scoreboards.create);
  const update = useMutation(api.admin.scoreboards.update);
  const remove = useMutation(api.admin.scoreboards.remove);

  const ids = {
    key: useId(),
    name: useId(),
    contests: useId(),
    theme: useId(),
    flag: useId(),
    badges: useId(),
    inPerson: useId(),
    freeze: useId(),
  };

  const loaded = !eventKey || existing !== undefined;
  const [key, setKey] = useState(eventKey ?? "");
  const [name, setName] = useState("");
  const [contestKeys, setContestKeys] = useState<string[]>([]);
  const [theme, setTheme] = useState("default");
  const [flagUrlTemplate, setFlagUrlTemplate] = useState("");
  const [badgeSlugs, setBadgeSlugs] = useState<string[]>([]);
  const [inPersonSlug, setInPersonSlug] = useState("");
  const [freezeMinutes, setFreezeMinutes] = useState("60");
  const [isPublic, setIsPublic] = useState(true);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (existing && !hydrated) {
    setHydrated(true);
    setKey(existing.key);
    setName(existing.name);
    setContestKeys(existing.contestKeys);
    setTheme(existing.theme);
    setFlagUrlTemplate(existing.flagUrlTemplate ?? "");
    setBadgeSlugs(existing.badgeOrganizationSlugs);
    setInPersonSlug(existing.inPersonOrganizationSlug ?? "");
    setFreezeMinutes(String(existing.freezeMinutes));
    setIsPublic(existing.isPublic);
  }

  async function save() {
    setError(null);
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(key)) {
      setError(t("keyInvalid"));
      return;
    }
    if (contestKeys.length === 0) {
      setError(t("contestsRequired"));
      return;
    }
    setBusy(true);
    try {
      const payload = {
        name: name.trim() || key,
        contestKeys,
        theme,
        flagUrlTemplate: flagUrlTemplate.trim() || null,
        badgeOrganizationSlugs: badgeSlugs,
        inPersonOrganizationSlug: inPersonSlug || null,
        freezeMinutes: Number(freezeMinutes) || 0,
        isPublic,
        reason: reason.trim() || undefined,
      };
      if (eventKey) {
        await update({ key: eventKey, ...payload });
        setReason("");
        toast.success(t("saved"));
      } else {
        await create({ key, ...payload });
        router.push(`/admin/scoreboards/${key}/`);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("refused"));
    }
    setBusy(false);
  }

  const breadcrumb = [
    { label: shell("consoleName"), href: "/admin/" },
    { label: list("title"), href: "/admin/scoreboards/" },
    { label: eventKey ?? t("breadcrumbNew") },
  ];

  if (eventKey && loaded && existing === null) {
    return (
      <AdminShell title={eventKey} breadcrumb={breadcrumb}>
        <EmptyState
          icon={<FileQuestion aria-hidden />}
          title={t("missingTitle")}
          description={t("missingDescription")}
          action={
            <Button asChild variant="secondary" size="sm">
              <Link href="/admin/scoreboards/">{t("backToList")}</Link>
            </Button>
          }
        />
      </AdminShell>
    );
  }

  return (
    <AdminShell
      title={eventKey ? (existing?.name ?? eventKey) : t("newTitle")}
      breadcrumb={breadcrumb}
      action={
        eventKey ? (
          <Button asChild variant="secondary" size="sm" icon={<ExternalLink aria-hidden />}>
            <Link href={`/scoreboard/${eventKey}/`}>{t("openBoard")}</Link>
          </Button>
        ) : null
      }
    >
      <AdminForm onSubmit={save}>
        <AdminFormError message={error} />

        <AdminSection title={t("general")}>
          <Field label={t("key")} htmlFor={ids.key} hint={t("keyHint")}>
            <Input
              id={ids.key}
              mono
              value={key}
              readOnly={!!eventKey}
              disabled={!!eventKey}
              title={eventKey ? t("keyLocked") : undefined}
              onChange={(event) => setKey(event.target.value.toLowerCase())}
              placeholder="winter25"
            />
          </Field>
          <Field label={t("name")} htmlFor={ids.name} hint={t("nameHint")}>
            <Input id={ids.name} value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field
            label={t("contests")}
            htmlFor={ids.contests}
            hint={t("contestsHint")}
            className="sm:col-span-2"
          >
            <MultiSelect
              id={ids.contests}
              values={contestKeys}
              onChange={setContestKeys}
              options={(options?.contests ?? []).map((row) => ({
                value: row.key,
                label: `${row.name} (${row.key})`,
              }))}
              placeholder={t("contestsPlaceholder")}
            />
          </Field>
        </AdminSection>

        <AdminSection title={t("presentation")}>
          <Field label={t("theme")} htmlFor={ids.theme}>
            <Select
              id={ids.theme}
              value={theme}
              onValueChange={setTheme}
              options={[
                { value: "default", label: t("themeDefault") },
                { value: "olympics", label: t("themeOlympics") },
              ]}
            />
          </Field>
          <Field label={t("flag")} htmlFor={ids.flag} optional={t("optional")} hint={t("flagHint")}>
            <Input
              id={ids.flag}
              mono
              value={flagUrlTemplate}
              onChange={(event) => setFlagUrlTemplate(event.target.value)}
              placeholder="https://example.com/flags/{username}.png"
            />
          </Field>
          <Field label={t("badges")} htmlFor={ids.badges} optional={t("optional")} hint={t("badgesHint")}>
            <MultiSelect
              id={ids.badges}
              values={badgeSlugs}
              onChange={setBadgeSlugs}
              options={(options?.organizations ?? []).map((row) => ({
                value: row.slug,
                label: row.name,
              }))}
              placeholder={t("badgesPlaceholder")}
            />
          </Field>
          <Field
            label={t("inPerson")}
            htmlFor={ids.inPerson}
            optional={t("optional")}
            hint={t("inPersonHint")}
          >
            <Select
              id={ids.inPerson}
              value={inPersonSlug}
              onValueChange={setInPersonSlug}
              options={(options?.organizations ?? []).map((row) => ({
                value: row.slug,
                label: row.name,
              }))}
              placeholder={t("inPersonPlaceholder")}
            />
          </Field>
        </AdminSection>

        <AdminSection title={t("freezeAndAccess")}>
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
            label={t("public")}
            hint={t("publicHint")}
            checked={isPublic}
            onCheckedChange={setIsPublic}
          />
        </AdminSection>
        <AdminFormFooter
          busy={busy}
          submitLabel={eventKey ? t("save") : t("create")}
          busyLabel={eventKey ? t("saving") : t("creating")}
          secondary={
            eventKey ? (
              <Button variant="secondary" onClick={() => setConfirmDelete(true)}>
                {t("deleteAction")}
              </Button>
            ) : (
              <Button asChild variant="secondary">
                <Link href="/admin/scoreboards/">{actions("cancel")}</Link>
              </Button>
            )
          }
        />
      </AdminForm>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle", { name: name || eventKey || "" })}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{actions("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setConfirmDelete(false);
                if (!eventKey) return;
                try {
                  await remove({ key: eventKey, reason: reason.trim() || undefined });
                  router.push("/admin/scoreboards/");
                } catch (caught) {
                  setError(caught instanceof Error ? caught.message : t("refused"));
                }
              }}
            >
              {actions("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminShell>
  );
}
