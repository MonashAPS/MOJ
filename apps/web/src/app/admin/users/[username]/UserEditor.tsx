"use client";

import { api } from "@convex/_generated/api";
import {
  Badge,
  Button,
  Checkbox,
  Field,
  FieldGroup,
  Input,
  MultiSelect,
  Panel,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  Textarea,
} from "@moj/ui";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { AdminForm } from "@/components/admin/AdminForm";
import { RevisionsPanel } from "@/components/admin/RevisionsPanel";
import { formatDate, formatDateTime } from "@/lib/format";
import { ConfirmAction, DASH, Flags, StatusLine } from "../../_components/console";
import {
  impersonateAction,
  removePasskeyAction,
  resetTwoFactorAction,
  revokeSessionsAction,
  setAccountActiveAction,
} from "../actions";

type UserRow = {
  _id: string;
  userId: string;
  username: string;
  displayName: string;
  displayRank: string;
  points: number;
  performancePoints: number;
  problemCount: number;
  rating?: number;
  isStaff: boolean;
  isSuperuser: boolean;
  isActive: boolean;
  isUnlisted: boolean;
  mute: boolean;
  isBannedFromProblemVoting: boolean;
  permissions: string[];
  notes: string;
  timezone: string;
  joinDate: number;
  lastAccess?: number;
  organizationSlugs: string[];
};

type KeyRow = {
  _id: string;
  name: string;
  prefix: string | null;
  scopes: string[];
  enabled: boolean;
  createdAt: number;
  expiresAt: number | null;
  lastUsedAt: number | null;
};

type Extras = {
  about: string;
  usernameDisplayOverride: string;
  languageKey: string | null;
  organizationSlugs: string[];
  apiKeys: KeyRow[];
  revisions: Array<{ _id: string; createdAt: number; reason: string; author: string | null }>;
} | null;

type Account = {
  account: {
    userId: string;
    username: string;
    email: string;
    emailVerified: boolean;
    banned: boolean;
    banReason: string | null;
    twoFactorEnabled: boolean;
    role: string | null;
  } | null;
  passkeys: Array<{
    id: string;
    name: string | null;
    deviceType: string;
    backedUp: boolean;
    createdAt: number | null;
    transports: string | null;
  }>;
  sessions: number;
};

const RANKS = [
  { value: "user", labelKey: "rankUser" },
  { value: "setter", labelKey: "rankSetter" },
  { value: "admin", labelKey: "rankAdmin" },
] as const;

/** DMOJ groups its permission codes by the model they act on. */
function groupPermissions(codes: string[]): Array<{ group: string; codes: string[] }> {
  const buckets = new Map<string, string[]>();
  for (const code of codes) {
    const tail = code.split(".")[1] ?? code;
    const group = tail.includes("problem")
      ? "groupProblems"
      : tail.includes("contest")
        ? "groupContests"
        : tail.includes("submission")
          ? "groupSubmissions"
          : tail.includes("organization")
            ? "groupOrganizations"
            : tail.includes("post") || tail.includes("comment")
              ? "groupCommunity"
              : tail.includes("profile") || tail.includes("totp")
                ? "groupAccounts"
                : "groupSite";
    const bucket = buckets.get(group);
    if (bucket) bucket.push(code);
    else buckets.set(group, [code]);
  }
  return [...buckets.entries()].map(([group, groupCodes]) => ({ group, codes: groupCodes }));
}

export function UserEditor({
  user,
  extras,
  permissionCodes,
  languages,
  organizations,
  timezones,
  account,
  viewerIsSuperuser,
  viewerUsername,
}: {
  user: UserRow;
  extras: Extras;
  permissionCodes: string[];
  languages: Array<{ key: string; name: string }>;
  organizations: Array<{ slug: string; name: string }>;
  timezones: string[];
  account: Account;
  viewerIsSuperuser: boolean;
  viewerUsername: string;
}) {
  const t = useTranslations("admin.users.editor");
  const panels = [
    {
      key: "profile",
      label: t("tabProfile"),
      content: (
        <ProfileForm
          user={user}
          extras={extras}
          languages={languages}
          organizations={organizations}
          timezones={timezones}
        />
      ),
    },
    {
      key: "permissions",
      label: t("tabPermissions"),
      content: (
        <PermissionsForm
          user={user}
          permissionCodes={permissionCodes}
          viewerIsSuperuser={viewerIsSuperuser}
        />
      ),
    },
    {
      key: "account",
      label: t("tabAccount"),
      content: (
        <AccountPanel
          user={user}
          account={account}
          viewerIsSuperuser={viewerIsSuperuser}
          viewerUsername={viewerUsername}
        />
      ),
    },
    {
      key: "keys",
      label: t("tabKeys"),
      content: <KeysPanel rows={extras?.apiKeys ?? null} username={user.username} />,
    },
    {
      key: "history",
      label: t("tabHistory"),
      content: (
        <RevisionsPanel
          rows={extras?.revisions ?? null}
          title={t("historyTitle", { username: user.username })}
        />
      ),
    },
  ];

  return (
    <div className="grid gap-4">
      <Summary user={user} account={account} />
      <Tabs panels={panels} />
    </div>
  );
}

function Summary({ user, account }: { user: UserRow; account: Account }) {
  const t = useTranslations("admin.users.summary");

  return (
    <Panel title={t("title")} bodyClassName="grid gap-3 p-3 sm:grid-cols-4">
      <Stat label={t("points")} value={user.points.toFixed(0)} />
      <Stat label={t("performancePoints")} value={user.performancePoints.toFixed(0)} />
      <Stat label={t("problemsSolved")} value={String(user.problemCount)} />
      <Stat label={t("rating")} value={user.rating === undefined ? DASH : String(user.rating)} />
      <Stat label={t("joined")} value={formatDate(user.joinDate)} />
      <Stat label={t("lastSeen")} value={user.lastAccess ? formatDate(user.lastAccess) : DASH} />
      <Stat label={t("email")} value={account.account?.email ?? DASH} mono />
      <div className="grid gap-1">
        <span className="font-sans text-xs font-semibold uppercase tracking-label text-muted-foreground">
          {t("state")}
        </span>
        <Flags
          flags={[
            { on: user.isSuperuser, label: t("flagSuperuser"), tone: "accent" },
            { on: user.isStaff && !user.isSuperuser, label: t("flagStaff"), tone: "accent" },
            { on: user.isUnlisted, label: t("flagUnlisted"), tone: "warn" },
            { on: user.mute, label: t("flagMuted"), tone: "warn" },
            { on: !user.isActive, label: t("flagDeactivated"), tone: "bad" },
            { on: account.account?.banned ?? false, label: t("flagBanned"), tone: "bad" },
          ]}
        />
      </div>
    </Panel>
  );
}

function Stat({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid gap-1">
      <span className="font-sans text-xs font-semibold uppercase tracking-label text-muted-foreground">
        {label}
      </span>
      <span
        className={mono ? "truncate font-mono text-mono tabular-nums" : "font-mono text-mono tabular-nums"}
      >
        {value}
      </span>
    </div>
  );
}

function ProfileForm({
  user,
  extras,
  languages,
  organizations,
  timezones,
}: {
  user: UserRow;
  extras: Extras;
  languages: Array<{ key: string; name: string }>;
  organizations: Array<{ slug: string; name: string }>;
  timezones: string[];
}) {
  const t = useTranslations("admin.users.profile");
  const edit = useMutation(api.admin.users.edit);
  const setMemberships = useMutation(api.pages.admin2.setUserMemberships);
  const router = useRouter();

  const initial = useMemo(
    () => ({
      displayRank: user.displayRank,
      usernameDisplayOverride: extras?.usernameDisplayOverride ?? "",
      timezone: user.timezone,
      languageKey: extras?.languageKey ?? "",
      about: extras?.about ?? "",
      notes: user.notes,
      rating: user.rating === undefined ? "" : String(user.rating),
      mute: user.mute,
      isUnlisted: user.isUnlisted,
      isBannedFromProblemVoting: user.isBannedFromProblemVoting,
      organizationSlugs: extras?.organizationSlugs ?? user.organizationSlugs,
    }),
    [user, extras],
  );

  const [form, setForm] = useState(initial);
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<{ error?: string; saved?: string }>({});
  const [busy, setBusy] = useState(false);

  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  function change<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setStatus({});
  }

  async function save() {
    setBusy(true);
    try {
      await edit({
        username: user.username,
        displayRank: form.displayRank as "user" | "setter" | "admin",
        usernameDisplayOverride: form.usernameDisplayOverride,
        timezone: form.timezone,
        about: form.about,
        notes: form.notes,
        mute: form.mute,
        isUnlisted: form.isUnlisted,
        isBannedFromProblemVoting: form.isBannedFromProblemVoting,
        rating: form.rating.trim() === "" ? null : Number(form.rating),
        reason,
      });
      await setMemberships({
        username: user.username,
        languageKey: form.languageKey === "" ? null : form.languageKey,
        organizationSlugs: form.organizationSlugs,
        reason,
      });
      setStatus({ saved: t("saved", { username: user.username }) });
      setReason("");
      router.refresh();
    } catch (error) {
      setStatus({ error: error instanceof Error ? error.message : t("saveFailed") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminForm
      onSubmit={save}
      managed
      dirty={dirty}
      busy={busy}
      error={status.error ?? null}
      saved={status.saved ?? null}
      submitLabel={t("submit")}
    >
      <FieldGroup columns={2}>
        <Field label={t("displayRank")} hint={t("displayRankHint")}>
          <Select
            options={RANKS.map((rank) => ({ value: rank.value, label: t(rank.labelKey) }))}
            value={form.displayRank}
            onValueChange={(value) => change("displayRank", value)}
            ariaLabel={t("displayRank")}
          />
        </Field>
        <Field label={t("displayName")} optional={t("optional")} hint={t("displayNameHint")}>
          <Input
            value={form.usernameDisplayOverride}
            onChange={(event) => change("usernameDisplayOverride", event.target.value)}
            placeholder={user.username}
          />
        </Field>
        <Field label={t("timezone")}>
          <Select
            options={timezones.map((zone) => ({ value: zone, label: zone }))}
            value={form.timezone}
            onValueChange={(value) => change("timezone", value)}
            ariaLabel={t("timezone")}
          />
        </Field>
        <Field label={t("preferredLanguage")} hint={t("preferredLanguageHint")}>
          <Select
            options={[
              { value: "", label: t("noPreference") },
              ...languages.map((language) => ({ value: language.key, label: language.name })),
            ]}
            value={form.languageKey}
            onValueChange={(value) => change("languageKey", value)}
            ariaLabel={t("preferredLanguage")}
          />
        </Field>
        <Field label={t("rating")} optional={t("optional")} hint={t("ratingHint")}>
          <Input
            type="number"
            mono
            value={form.rating}
            onChange={(event) => change("rating", event.target.value)}
          />
        </Field>
        <Field label={t("organizations")} hint={t("organizationsHint")}>
          <MultiSelect
            options={organizations.map((organization) => ({
              value: organization.slug,
              label: organization.name,
            }))}
            values={form.organizationSlugs}
            onChange={(values) => change("organizationSlugs", values)}
            searchPlaceholder={t("organizationSearchPlaceholder")}
            emptyText={t("organizationEmpty")}
          />
        </Field>
      </FieldGroup>

      <Field label={t("about")} hint={t("aboutHint")}>
        <Textarea
          mono
          rows={6}
          value={form.about}
          onChange={(event) => change("about", event.target.value)}
        />
      </Field>

      <Field label={t("staffNotes")} hint={t("staffNotesHint")}>
        <Textarea rows={3} value={form.notes} onChange={(event) => change("notes", event.target.value)} />
      </Field>

      <FieldGroup columns={2}>
        <Checkbox
          checked={form.mute}
          onCheckedChange={(value) => change("mute", value === true)}
          label={t("muted")}
        />
        <Checkbox
          checked={form.isUnlisted}
          onCheckedChange={(value) => change("isUnlisted", value === true)}
          label={t("unlisted")}
        />
        <Checkbox
          checked={form.isBannedFromProblemVoting}
          onCheckedChange={(value) => change("isBannedFromProblemVoting", value === true)}
          label={t("votingBanned")}
        />
      </FieldGroup>
    </AdminForm>
  );
}

function PermissionsForm({
  user,
  permissionCodes,
  viewerIsSuperuser,
}: {
  user: UserRow;
  permissionCodes: string[];
  viewerIsSuperuser: boolean;
}) {
  const t = useTranslations("admin.users.permissions");
  const edit = useMutation(api.admin.users.edit);
  const router = useRouter();

  const initial = useMemo(
    () => ({
      isStaff: user.isStaff,
      isSuperuser: user.isSuperuser,
      permissions: [...user.permissions].sort(),
    }),
    [user],
  );
  const [form, setForm] = useState(initial);
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<{ error?: string; saved?: string }>({});
  const [busy, setBusy] = useState(false);

  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const groups = useMemo(() => groupPermissions(permissionCodes), [permissionCodes]);

  if (!viewerIsSuperuser) {
    return (
      <Panel title={t("title")} bodyClassName="p-3">
        <p className="text-sm text-muted-foreground">
          {t("readOnly", { username: user.username, count: user.permissions.length })}
        </p>
        {user.permissions.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-1">
            {[...user.permissions].sort().map((code) => (
              <li key={code}>
                <Badge variant="outline" mono>
                  {code}
                </Badge>
              </li>
            ))}
          </ul>
        ) : null}
      </Panel>
    );
  }

  function toggle(code: string, on: boolean) {
    setForm((current) => ({
      ...current,
      permissions: on
        ? [...current.permissions, code].sort()
        : current.permissions.filter((entry) => entry !== code),
    }));
    setStatus({});
  }

  async function save() {
    setBusy(true);
    try {
      await edit({
        username: user.username,
        isStaff: form.isStaff || form.isSuperuser,
        isSuperuser: form.isSuperuser,
        permissions: form.permissions,
        reason,
      });
      setStatus({ saved: t("saved", { username: user.username }) });
      setReason("");
      router.refresh();
    } catch (error) {
      setStatus({ error: error instanceof Error ? error.message : t("saveFailed") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminForm
      onSubmit={save}
      managed
      dirty={dirty}
      busy={busy}
      error={status.error ?? null}
      saved={status.saved ?? null}
      submitLabel={t("submit")}
    >
      <FieldGroup columns={2}>
        <Checkbox
          checked={form.isStaff || form.isSuperuser}
          disabled={form.isSuperuser}
          title={form.isSuperuser ? t("staffLocked") : undefined}
          onCheckedChange={(value) => setForm((current) => ({ ...current, isStaff: value === true }))}
          label={t("staff")}
        />
        <Checkbox
          checked={form.isSuperuser}
          onCheckedChange={(value) =>
            setForm((current) => ({
              ...current,
              isSuperuser: value === true,
              isStaff: value === true || current.isStaff,
            }))
          }
          label={t("superuser")}
        />
      </FieldGroup>

      <div className="grid gap-3 sm:grid-cols-2">
        {groups.map((group) => (
          <Panel key={group.group} title={t(group.group)} bodyClassName="grid gap-2 p-3">
            {group.codes.map((code) => (
              <Checkbox
                key={code}
                checked={form.isSuperuser || form.permissions.includes(code)}
                disabled={form.isSuperuser}
                title={form.isSuperuser ? t("codeLocked") : undefined}
                onCheckedChange={(value) => toggle(code, value === true)}
                label={<span className="font-mono text-mono">{code}</span>}
              />
            ))}
          </Panel>
        ))}
      </div>
    </AdminForm>
  );
}

function AccountPanel({
  user,
  account,
  viewerIsSuperuser,
  viewerUsername,
}: {
  user: UserRow;
  account: Account;
  viewerIsSuperuser: boolean;
  viewerUsername: string;
}) {
  const t = useTranslations("admin.users.account");
  const common = useTranslations("common.actions");
  const recalculate = useMutation(api.admin.users.recalculatePoints);
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const self = user.username === viewerUsername;

  function report(result: { ok: true } | { ok: false; error: string }, ok: string) {
    setMessage(result.ok ? { tone: "ok", text: ok } : { tone: "bad", text: result.error });
    if (result.ok) router.refresh();
  }

  return (
    <div className="grid gap-4">
      {message ? <StatusLine tone={message.tone}>{message.text}</StatusLine> : null}

      <Panel title={t("signIn")} bodyClassName="grid gap-3 p-3">
        <div className="grid gap-2 sm:grid-cols-3">
          <Stat label={t("email")} value={account.account?.email ?? DASH} mono />
          <Stat label={t("verified")} value={account.account?.emailVerified ? common("yes") : common("no")} />
          <Stat label={t("sessions")} value={String(account.sessions)} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={account.account?.twoFactorEnabled ? "good" : "neutral"}>
            {account.account?.twoFactorEnabled ? t("twoFactorOn") : t("twoFactorOff")}
          </Badge>
          <ConfirmAction
            trigger={
              <Button
                variant="secondary"
                size="sm"
                disabled={!viewerIsSuperuser}
                title={viewerIsSuperuser ? undefined : t("resetTwoFactorDenied")}
              >
                {t("resetTwoFactor")}
              </Button>
            }
            title={t("resetTwoFactorTitle", { username: user.username })}
            description={t("resetTwoFactorDescription")}
            confirmLabel={t("resetTwoFactor")}
            onConfirm={async () => {
              const result = await resetTwoFactorAction(user.userId);
              report(result, t("resetTwoFactorDone", { username: user.username }));
            }}
          />
          <ConfirmAction
            trigger={
              <Button variant="secondary" size="sm">
                {t("signOutEverywhere")}
              </Button>
            }
            title={t("revokeSessionsTitle", { username: user.username })}
            description={t("revokeSessionsDescription", { count: account.sessions })}
            confirmLabel={t("revokeSessionsConfirm")}
            onConfirm={async () => {
              const result = await revokeSessionsAction(user.userId);
              report(result, t("revokeSessionsDone", { username: user.username }));
            }}
          />
          <Button
            variant="secondary"
            size="sm"
            disabled={!viewerIsSuperuser || self}
            title={self ? t("impersonateSelf") : viewerIsSuperuser ? undefined : t("impersonateDenied")}
            onClick={() =>
              startTransition(async () => {
                const result = await impersonateAction(user.userId);
                if (result.ok) window.location.assign("/");
                else setMessage({ tone: "bad", text: result.error });
              })
            }
          >
            {t("impersonate")}
          </Button>
        </div>
      </Panel>

      <Panel title={t("passkeys")} bodyClassName="p-0">
        {account.passkeys.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">
            {t("passkeysNone", { username: user.username })}
          </p>
        ) : (
          <Table dense scrollable={false}>
            <TableHeader>
              <TableRow>
                <TableHead>{t("passkeyName")}</TableHead>
                <TableHead>{t("passkeyDevice")}</TableHead>
                <TableHead>{t("passkeyBackedUp")}</TableHead>
                <TableHead numeric>{t("passkeyAdded")}</TableHead>
                <TableHead>
                  <span className="sr-only">{t("passkeyActions")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {account.passkeys.map((passkey) => (
                <TableRow key={passkey.id}>
                  <TableCell>{passkey.name ?? t("passkeyUnnamed")}</TableCell>
                  <TableCell className="font-mono text-mono">{passkey.deviceType}</TableCell>
                  <TableCell>{passkey.backedUp ? common("yes") : common("no")}</TableCell>
                  <TableCell numeric>{passkey.createdAt ? formatDate(passkey.createdAt) : DASH}</TableCell>
                  <TableCell>
                    <ConfirmAction
                      trigger={
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!viewerIsSuperuser}
                          title={viewerIsSuperuser ? undefined : t("passkeyRemoveDenied")}
                        >
                          {t("passkeyRemove")}
                        </Button>
                      }
                      title={t("passkeyRemoveTitle")}
                      description={
                        passkey.name
                          ? t("passkeyRemoveDescription", {
                              name: passkey.name,
                              username: user.username,
                            })
                          : t("passkeyRemoveDescriptionUnnamed", { username: user.username })
                      }
                      confirmLabel={t("passkeyRemoveConfirm")}
                      onConfirm={async () => {
                        const result = await removePasskeyAction(user.userId, passkey.id);
                        report(result, t("passkeyRemoveDone"));
                      }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      <Panel title={t("standing")} bodyClassName="grid gap-3 p-3">
        <Field label={t("reason")} htmlFor="account-reason" hint={t("reasonHint")}>
          <Input
            id="account-reason"
            value={reason}
            maxLength={200}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t("reasonPlaceholder")}
          />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              startTransition(async () => {
                try {
                  const result = await recalculate({ usernames: [user.username] });
                  const first = result[0];
                  setMessage({
                    tone: "ok",
                    text: first
                      ? t("recalculated", {
                          username: first.username,
                          points: first.points.toFixed(0),
                          performancePoints: first.performancePoints.toFixed(0),
                        })
                      : t("recalculatedPlain"),
                  });
                  router.refresh();
                } catch (error) {
                  setMessage({
                    tone: "bad",
                    text: error instanceof Error ? error.message : t("recalculateFailed"),
                  });
                }
              })
            }
          >
            {t("recalculate")}
          </Button>

          {user.isActive ? (
            <ConfirmAction
              trigger={
                <Button
                  variant="danger"
                  size="sm"
                  disabled={self}
                  title={self ? t("deactivateSelf") : undefined}
                >
                  {t("deactivate")}
                </Button>
              }
              title={t("deactivateTitle", { username: user.username })}
              description={t("deactivateDescription")}
              confirmLabel={t("deactivate")}
              onConfirm={async () => {
                const result = await setAccountActiveAction(user.username, false, reason);
                report(result, t("deactivateDone", { username: user.username }));
              }}
            />
          ) : (
            <ConfirmAction
              trigger={
                <Button variant="secondary" size="sm">
                  {t("reactivate")}
                </Button>
              }
              title={t("reactivateTitle", { username: user.username })}
              description={t("reactivateDescription")}
              confirmLabel={t("reactivate")}
              onConfirm={async () => {
                const result = await setAccountActiveAction(user.username, true, reason);
                report(result, t("reactivateDone", { username: user.username }));
              }}
            />
          )}
        </div>
        {account.account?.banned && account.account.banReason ? (
          <p className="text-sm text-muted-foreground">
            {t("banReason", { reason: account.account.banReason })}
          </p>
        ) : null}
      </Panel>
    </div>
  );
}

function KeysPanel({ rows, username }: { rows: KeyRow[] | null; username: string }) {
  const t = useTranslations("admin.users.keys");

  if (rows === null) {
    return (
      <Panel title={t("title")} bodyClassName="p-3">
        <p className="text-sm text-muted-foreground">{t("unreadable")}</p>
      </Panel>
    );
  }
  if (rows.length === 0) {
    return (
      <Panel title={t("title")} bodyClassName="p-3">
        <p className="text-sm text-muted-foreground">{t("none", { username })}</p>
      </Panel>
    );
  }
  return (
    <Panel title={t("title")} bodyClassName="p-0">
      <Table dense scrollable={false}>
        <TableHeader>
          <TableRow>
            <TableHead>{t("columnName")}</TableHead>
            <TableHead>{t("columnPrefix")}</TableHead>
            <TableHead>{t("columnScopes")}</TableHead>
            <TableHead numeric>{t("columnCreated")}</TableHead>
            <TableHead numeric>{t("columnExpires")}</TableHead>
            <TableHead numeric>{t("columnLastUsed")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row._id}>
              <TableCell>{row.name}</TableCell>
              <TableCell className="font-mono text-mono">{row.prefix ?? DASH}</TableCell>
              <TableCell className="font-mono text-mono">{row.scopes.join(", ")}</TableCell>
              <TableCell numeric>{formatDateTime(row.createdAt)}</TableCell>
              <TableCell numeric>{row.expiresAt ? formatDateTime(row.expiresAt) : t("never")}</TableCell>
              <TableCell numeric>{row.lastUsedAt ? formatDateTime(row.lastUsedAt) : DASH}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Panel>
  );
}
