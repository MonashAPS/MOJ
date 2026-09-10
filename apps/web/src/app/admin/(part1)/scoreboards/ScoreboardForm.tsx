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
import { useId, useState } from "react";
import {
  AdminCheckField,
  AdminForm,
  AdminFormError,
  AdminFormFooter,
  AdminSection,
  AdminShell,
  ReasonField,
} from "@/components/admin";
import { useConsoleQuery } from "@/components/admin/useConsoleQuery";

/** `scoreboardEvents`: the rows that replaced the fork's MCPC_SCOREBOARDS setting. */
export function ScoreboardForm({ eventKey }: { eventKey?: string }) {
  const router = useRouter();
  const existing = useQuery(api.admin.scoreboards.get, eventKey ? { key: eventKey } : "skip");
  const consoleOptions = useConsoleQuery(api.pages.admin1.scoreboardOptions, {});
  const contestFallback = useQuery(
    api.admin.contests.list,
    consoleOptions.unavailable ? { paginationOpts: { numItems: 200, cursor: null } } : "skip",
  );
  const options = consoleOptions.unavailable
    ? {
        contests: (contestFallback?.page ?? []).map((row) => ({
          key: row.key,
          name: row.name,
          startTime: row.startTime,
        })),
        organizations: [] as { slug: string; name: string }[],
      }
    : consoleOptions.data;
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
  const [reasonError, setReasonError] = useState<string | undefined>();
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
      setError("Scoreboard keys use lowercase letters, digits, '-' and '_'.");
      return;
    }
    if (contestKeys.length === 0) {
      setError("A scoreboard needs at least one contest.");
      return;
    }
    if (eventKey && !reason.trim()) {
      setReasonError("Say what you changed so the revision is worth reading.");
      return;
    }
    setReasonError(undefined);
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
        toast.success("Scoreboard saved.");
      } else {
        await create({ key, ...payload });
        router.push(`/admin/scoreboards/${key}/`);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The change was refused.");
    }
    setBusy(false);
  }

  const breadcrumb = [
    { label: "Staff console", href: "/admin/" },
    { label: "Scoreboards", href: "/admin/scoreboards/" },
    { label: eventKey ?? "New" },
  ];

  if (eventKey && loaded && existing === null) {
    return (
      <AdminShell title={eventKey} breadcrumb={breadcrumb}>
        <EmptyState
          icon={<FileQuestion aria-hidden />}
          title="No such scoreboard"
          description="There is no scoreboard with that key."
          action={
            <Button asChild variant="secondary" size="sm">
              <Link href="/admin/scoreboards/">Back to scoreboards</Link>
            </Button>
          }
        />
      </AdminShell>
    );
  }

  return (
    <AdminShell
      title={eventKey ? (existing?.name ?? eventKey) : "New scoreboard"}
      breadcrumb={breadcrumb}
      action={
        eventKey ? (
          <Button asChild variant="secondary" size="sm" icon={<ExternalLink aria-hidden />}>
            <Link href={`/scoreboard/${eventKey}/`}>Open board</Link>
          </Button>
        ) : null
      }
    >
      <AdminForm onSubmit={save}>
        <AdminFormError message={error} />

        <AdminSection title="General">
          <Field
            label="Key"
            htmlFor={ids.key}
            hint="The URL: /scoreboard/<key>. Lowercase letters, digits, dashes and underscores."
          >
            <Input
              id={ids.key}
              mono
              value={key}
              readOnly={!!eventKey}
              disabled={!!eventKey}
              title={eventKey ? "A scoreboard's key cannot change." : undefined}
              onChange={(event) => setKey(event.target.value.toLowerCase())}
              placeholder="mcpc25"
            />
          </Field>
          <Field label="Name" htmlFor={ids.name} hint="Shown across the top of the hall display.">
            <Input id={ids.name} value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field
            label="Contests"
            htmlFor={ids.contests}
            hint="Each contest becomes a division on the board."
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
              placeholder="Choose contests"
            />
          </Field>
        </AdminSection>

        <AdminSection title="Presentation">
          <Field label="Theme" htmlFor={ids.theme}>
            <Select
              id={ids.theme}
              value={theme}
              onValueChange={setTheme}
              options={[
                { value: "default", label: "Default" },
                { value: "olympics", label: "Olympics" },
              ]}
            />
          </Field>
          <Field
            label="Flag pattern"
            htmlFor={ids.flag}
            optional=" (optional)"
            hint="A URL with {username} in it, for the flag beside each row."
          >
            <Input
              id={ids.flag}
              mono
              value={flagUrlTemplate}
              onChange={(event) => setFlagUrlTemplate(event.target.value)}
              placeholder="https://example.com/flags/{username}.png"
            />
          </Field>
          <Field
            label="Badge organisations"
            htmlFor={ids.badges}
            optional=" (optional)"
            hint="Members of these organisations get a badge on their row."
          >
            <MultiSelect
              id={ids.badges}
              values={badgeSlugs}
              onChange={setBadgeSlugs}
              options={(options?.organizations ?? []).map((row) => ({
                value: row.slug,
                label: row.name,
              }))}
              placeholder="No badges"
            />
          </Field>
          <Field
            label="In-person organisation"
            htmlFor={ids.inPerson}
            optional=" (optional)"
            hint="Drives the All / In-person toggle on the board."
          >
            <Select
              id={ids.inPerson}
              value={inPersonSlug}
              onValueChange={setInPersonSlug}
              options={(options?.organizations ?? []).map((row) => ({
                value: row.slug,
                label: row.name,
              }))}
              placeholder="No in-person split"
            />
          </Field>
        </AdminSection>

        <AdminSection title="Freeze and access">
          <Field
            label="Freeze"
            htmlFor={ids.freeze}
            hint="Minutes before each contest ends that this board stops updating."
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
            label="Public"
            hint="The board's URL works for anyone, whatever the contests' scoreboard visibility says."
            checked={isPublic}
            onCheckedChange={setIsPublic}
          />
        </AdminSection>

        <ReasonField value={reason} onChange={setReason} error={reasonError} entity="scoreboard" />
        <AdminFormFooter
          busy={busy}
          submitLabel={eventKey ? "Save scoreboard" : "Create scoreboard"}
          busyLabel={eventKey ? "Saving…" : "Creating…"}
          secondary={
            eventKey ? (
              <Button variant="secondary" onClick={() => setConfirmDelete(true)}>
                Delete scoreboard
              </Button>
            ) : (
              <Button asChild variant="secondary">
                <Link href="/admin/scoreboards/">Cancel</Link>
              </Button>
            )
          }
        />
      </AdminForm>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete the {name || eventKey} scoreboard?</AlertDialogTitle>
            <AlertDialogDescription>
              Its URL stops working. The contests it named, and their rankings, are untouched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setConfirmDelete(false);
                if (!eventKey) return;
                try {
                  await remove({ key: eventKey, reason: reason.trim() || undefined });
                  router.push("/admin/scoreboards/");
                } catch (caught) {
                  setError(caught instanceof Error ? caught.message : "The change was refused.");
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminShell>
  );
}
