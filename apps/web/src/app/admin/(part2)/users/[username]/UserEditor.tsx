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
import { useMemo, useState, useTransition } from "react";
import { AdminForm } from "@/components/admin/AdminForm";
import { RevisionsPanel } from "@/components/admin/RevisionsPanel";
import { formatDate, formatDateTime } from "@/lib/format";
import { ConfirmAction, DASH, Flag, StatusLine } from "../../_components/console";
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
  { value: "user", label: "User" },
  { value: "setter", label: "Problem setter" },
  { value: "admin", label: "Admin" },
];

/** DMOJ groups its permission codes by the model they act on. */
function groupPermissions(codes: string[]): Array<{ group: string; codes: string[] }> {
  const buckets = new Map<string, string[]>();
  for (const code of codes) {
    const tail = code.split(".")[1] ?? code;
    const group = tail.includes("problem")
      ? "Problems"
      : tail.includes("contest")
        ? "Contests"
        : tail.includes("submission")
          ? "Submissions"
          : tail.includes("organization")
            ? "Organizations"
            : tail.includes("post") || tail.includes("comment")
              ? "Community"
              : tail.includes("profile") || tail.includes("totp")
                ? "Accounts"
                : "Site";
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
  const panels = [
    {
      key: "profile",
      label: "Profile",
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
      label: "Permissions",
      content: (
        <PermissionsForm user={user} permissionCodes={permissionCodes} viewerIsSuperuser={viewerIsSuperuser} />
      ),
    },
    {
      key: "account",
      label: "Account",
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
      label: "API keys",
      content: <KeysPanel rows={extras?.apiKeys ?? null} username={user.username} />,
    },
    {
      key: "history",
      label: "History",
      content: <RevisionsPanel rows={extras?.revisions ?? null} title={`Changes to ${user.username}`} />,
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
  return (
    <Panel title="At a glance" bodyClassName="grid gap-3 p-3 sm:grid-cols-4">
      <Stat label="Points" value={user.points.toFixed(0)} />
      <Stat label="Performance points" value={user.performancePoints.toFixed(0)} />
      <Stat label="Problems solved" value={String(user.problemCount)} />
      <Stat label="Rating" value={user.rating === undefined ? DASH : String(user.rating)} />
      <Stat label="Joined" value={formatDate(user.joinDate)} />
      <Stat label="Last seen" value={user.lastAccess ? formatDate(user.lastAccess) : DASH} />
      <Stat label="Email" value={account.account?.email ?? DASH} mono />
      <div className="grid gap-1">
        <span className="font-sans text-xs font-semibold uppercase tracking-label text-muted-foreground">
          State
        </span>
        <span className="flex flex-wrap gap-1">
          <Flag on={user.isSuperuser} label="Superuser" tone="accent" />
          <Flag on={user.isStaff && !user.isSuperuser} label="Staff" tone="accent" />
          <Flag on={user.isUnlisted} label="Unlisted" tone="warn" />
          <Flag on={user.mute} label="Muted" tone="warn" />
          <Flag on={!user.isActive} label="Deactivated" tone="bad" />
          <Flag on={account.account?.banned ?? false} label="Banned" tone="bad" />
        </span>
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
      <span className={mono ? "truncate font-mono text-mono tabular-nums" : "font-mono text-mono tabular-nums"}>
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
    if (reason.trim().length === 0) {
      setStatus({ error: "Give a reason for the change; it is recorded on the revision." });
      return;
    }
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
      setStatus({ saved: `${user.username} has been updated.` });
      setReason("");
      router.refresh();
    } catch (error) {
      setStatus({ error: error instanceof Error ? error.message : "That could not be saved." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminForm
      onSubmit={save}
      reason={reason}
      onReasonChange={setReason}
      dirty={dirty}
      busy={busy}
      error={status.error ?? null}
      saved={status.saved ?? null}
      submitLabel="Save profile"
    >
      <FieldGroup columns={2}>
        <Field label="Display rank" hint="DMOJ's rank badge on the username.">
          <Select
            options={RANKS}
            value={form.displayRank}
            onValueChange={(value) => change("displayRank", value)}
            ariaLabel="Display rank"
          />
        </Field>
        <Field label="Display name" optional=" (optional)" hint="Shown instead of the username.">
          <Input
            value={form.usernameDisplayOverride}
            onChange={(event) => change("usernameDisplayOverride", event.target.value)}
            placeholder={user.username}
          />
        </Field>
        <Field label="Timezone">
          <Select
            options={timezones.map((zone) => ({ value: zone, label: zone }))}
            value={form.timezone}
            onValueChange={(value) => change("timezone", value)}
            ariaLabel="Timezone"
          />
        </Field>
        <Field label="Preferred language" hint="The language the submit page opens with.">
          <Select
            options={[
              { value: "", label: "No preference" },
              ...languages.map((language) => ({ value: language.key, label: language.name })),
            ]}
            value={form.languageKey}
            onValueChange={(value) => change("languageKey", value)}
            ariaLabel="Preferred language"
          />
        </Field>
        <Field label="Rating" optional=" (optional)" hint="Blank means unrated.">
          <Input
            type="number"
            mono
            value={form.rating}
            onChange={(event) => change("rating", event.target.value)}
          />
        </Field>
        <Field label="Organizations" hint="Membership is written straight to the organisation.">
          <MultiSelect
            options={organizations.map((organization) => ({
              value: organization.slug,
              label: organization.name,
            }))}
            values={form.organizationSlugs}
            onChange={(values) => change("organizationSlugs", values)}
            searchPlaceholder="Find an organization"
            emptyText="No organization by that name."
          />
        </Field>
      </FieldGroup>

      <Field label="About" hint="Markdown, rendered on the member's profile page.">
        <Textarea
          mono
          rows={6}
          value={form.about}
          onChange={(event) => change("about", event.target.value)}
        />
      </Field>

      <Field label="Staff notes" hint="Only staff ever see this.">
        <Textarea rows={3} value={form.notes} onChange={(event) => change("notes", event.target.value)} />
      </Field>

      <FieldGroup columns={2}>
        <Checkbox
          checked={form.mute}
          onCheckedChange={(value) => change("mute", value === true)}
          label="Muted — comments and tickets are hidden from everyone else"
        />
        <Checkbox
          checked={form.isUnlisted}
          onCheckedChange={(value) => change("isUnlisted", value === true)}
          label="Unlisted — kept off the leaderboard and the user list"
        />
        <Checkbox
          checked={form.isBannedFromProblemVoting}
          onCheckedChange={(value) => change("isBannedFromProblemVoting", value === true)}
          label="Banned from voting on problem points"
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
  const edit = useMutation(api.admin.users.edit);
  const router = useRouter();

  const initial = useMemo(
    () => ({ isStaff: user.isStaff, isSuperuser: user.isSuperuser, permissions: [...user.permissions].sort() }),
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
      <Panel title="Permissions" bodyClassName="p-3">
        <p className="text-sm text-muted-foreground">
          Only a superuser may change staff flags or permission codes. {user.username} currently holds{" "}
          {user.permissions.length === 0 ? "no permissions" : `${user.permissions.length} permissions`}.
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
    if (reason.trim().length === 0) {
      setStatus({ error: "Give a reason for the change; it is recorded on the revision." });
      return;
    }
    setBusy(true);
    try {
      await edit({
        username: user.username,
        isStaff: form.isStaff || form.isSuperuser,
        isSuperuser: form.isSuperuser,
        permissions: form.permissions,
        reason,
      });
      setStatus({ saved: `Permissions for ${user.username} have been updated.` });
      setReason("");
      router.refresh();
    } catch (error) {
      setStatus({ error: error instanceof Error ? error.message : "That could not be saved." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminForm
      onSubmit={save}
      reason={reason}
      onReasonChange={setReason}
      dirty={dirty}
      busy={busy}
      error={status.error ?? null}
      saved={status.saved ?? null}
      submitLabel="Save permissions"
    >
      <FieldGroup columns={2}>
        <Checkbox
          checked={form.isStaff || form.isSuperuser}
          disabled={form.isSuperuser}
          title={form.isSuperuser ? "A superuser is always staff." : undefined}
          onCheckedChange={(value) => setForm((current) => ({ ...current, isStaff: value === true }))}
          label="Staff — may open the console"
        />
        <Checkbox
          checked={form.isSuperuser}
          onCheckedChange={(value) =>
            setForm((current) => ({ ...current, isSuperuser: value === true, isStaff: value === true || current.isStaff }))
          }
          label="Superuser — every permission, whatever the checklist says"
        />
      </FieldGroup>

      <div className="grid gap-3 sm:grid-cols-2">
        {groups.map((group) => (
          <Panel key={group.group} title={group.group} bodyClassName="grid gap-2 p-3">
            {group.codes.map((code) => (
              <Checkbox
                key={code}
                checked={form.isSuperuser || form.permissions.includes(code)}
                disabled={form.isSuperuser}
                title={form.isSuperuser ? "A superuser already holds every permission." : undefined}
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

      <Panel title="Sign-in" bodyClassName="grid gap-3 p-3">
        <div className="grid gap-2 sm:grid-cols-3">
          <Stat label="Email" value={account.account?.email ?? DASH} mono />
          <Stat label="Verified" value={account.account?.emailVerified ? "Yes" : "No"} />
          <Stat label="Active sessions" value={String(account.sessions)} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={account.account?.twoFactorEnabled ? "good" : "neutral"}>
            {account.account?.twoFactorEnabled ? "Two-factor on" : "Two-factor off"}
          </Badge>
          <ConfirmAction
            trigger={
              <Button
                variant="secondary"
                size="sm"
                disabled={!viewerIsSuperuser}
                title={viewerIsSuperuser ? undefined : "Only a superuser may reset a member's factors."}
              >
                Reset two-factor
              </Button>
            }
            title={`Reset two-factor for ${user.username}?`}
            description="Every TOTP secret and backup code on the account is removed and the sessions are revoked. The member enrols again on their next sign-in."
            confirmLabel="Reset two-factor"
            onConfirm={async () => {
              const result = await resetTwoFactorAction(user.userId);
              report(result, `Two-factor has been reset for ${user.username}.`);
            }}
          />
          <ConfirmAction
            trigger={
              <Button variant="secondary" size="sm">
                Sign out everywhere
              </Button>
            }
            title={`Revoke every session for ${user.username}?`}
            description={`${account.sessions} ${account.sessions === 1 ? "session is" : "sessions are"} open. The member has to sign in again.`}
            confirmLabel="Revoke sessions"
            onConfirm={async () => {
              const result = await revokeSessionsAction(user.userId);
              report(result, `Sessions for ${user.username} have been revoked.`);
            }}
          />
          <Button
            variant="secondary"
            size="sm"
            disabled={!viewerIsSuperuser || self}
            title={
              self
                ? "You are already signed in as yourself."
                : viewerIsSuperuser
                  ? undefined
                  : "Only a superuser may impersonate a member."
            }
            onClick={() =>
              startTransition(async () => {
                const result = await impersonateAction(user.userId);
                if (result.ok) window.location.assign("/");
                else setMessage({ tone: "bad", text: result.error });
              })
            }
          >
            Impersonate
          </Button>
        </div>
      </Panel>

      <Panel title="Passkeys" bodyClassName="p-0">
        {account.passkeys.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">
            {user.username} has not registered a passkey.
          </p>
        ) : (
          <Table dense scrollable={false}>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Device</TableHead>
                <TableHead>Backed up</TableHead>
                <TableHead numeric>Added</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {account.passkeys.map((passkey) => (
                <TableRow key={passkey.id}>
                  <TableCell>{passkey.name ?? "Unnamed passkey"}</TableCell>
                  <TableCell className="font-mono text-mono">{passkey.deviceType}</TableCell>
                  <TableCell>{passkey.backedUp ? "Yes" : "No"}</TableCell>
                  <TableCell numeric>{passkey.createdAt ? formatDate(passkey.createdAt) : DASH}</TableCell>
                  <TableCell>
                    <ConfirmAction
                      trigger={
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!viewerIsSuperuser}
                          title={viewerIsSuperuser ? undefined : "Only a superuser may remove a passkey."}
                        >
                          Remove
                        </Button>
                      }
                      title="Remove this passkey?"
                      description={`${passkey.name ?? "This passkey"} stops working immediately. ${user.username} can register another one.`}
                      confirmLabel="Remove passkey"
                      onConfirm={async () => {
                        const result = await removePasskeyAction(user.userId, passkey.id);
                        report(result, "The passkey has been removed.");
                      }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      <Panel title="Standing" bodyClassName="grid gap-3 p-3">
        <Field
          label="Reason for change"
          htmlFor="account-reason"
          hint="Recorded on the revision with whatever you do below."
        >
          <Input
            id="account-reason"
            value={reason}
            maxLength={200}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Repeated abuse in comments"
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
                      ? `${first.username} now has ${first.points.toFixed(0)} points and ${first.performancePoints.toFixed(0)} performance points.`
                      : "Points have been recalculated.",
                  });
                  router.refresh();
                } catch (error) {
                  setMessage({
                    tone: "bad",
                    text: error instanceof Error ? error.message : "Points could not be recalculated.",
                  });
                }
              })
            }
          >
            Recalculate points
          </Button>

          {user.isActive ? (
            <ConfirmAction
              trigger={
                <Button
                  variant="danger"
                  size="sm"
                  disabled={self}
                  title={self ? "You cannot deactivate your own account." : undefined}
                >
                  Deactivate
                </Button>
              }
              title={`Deactivate ${user.username}?`}
              description="The account is banned in Better Auth, every session is revoked and the profile is hidden from the leaderboard. Nothing is deleted."
              confirmLabel="Deactivate"
              onConfirm={async () => {
                const result = await setAccountActiveAction(user.username, false, reason);
                report(result, `${user.username} has been deactivated.`);
              }}
            />
          ) : (
            <ConfirmAction
              trigger={
                <Button variant="secondary" size="sm">
                  Reactivate
                </Button>
              }
              title={`Reactivate ${user.username}?`}
              description="The ban is lifted and the member can sign in again. They stay unlisted until you clear that on the profile tab."
              confirmLabel="Reactivate"
              onConfirm={async () => {
                const result = await setAccountActiveAction(user.username, true, reason);
                report(result, `${user.username} has been reactivated.`);
              }}
            />
          )}
        </div>
        {account.account?.banned && account.account.banReason ? (
          <p className="text-sm text-muted-foreground">Ban reason: {account.account.banReason}</p>
        ) : null}
      </Panel>
    </div>
  );
}

function KeysPanel({ rows, username }: { rows: KeyRow[] | null; username: string }) {
  if (rows === null) {
    return (
      <Panel title="API keys" bodyClassName="p-3">
        <p className="text-sm text-muted-foreground">
          The key table could not be read. A key is issued from the console&apos;s API keys section.
        </p>
      </Panel>
    );
  }
  if (rows.length === 0) {
    return (
      <Panel title="API keys" bodyClassName="p-3">
        <p className="text-sm text-muted-foreground">{username} has not issued an API key.</p>
      </Panel>
    );
  }
  return (
    <Panel title="API keys" bodyClassName="p-0">
      <Table dense scrollable={false}>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Prefix</TableHead>
            <TableHead>Scopes</TableHead>
            <TableHead numeric>Created</TableHead>
            <TableHead numeric>Expires</TableHead>
            <TableHead numeric>Last used</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row._id}>
              <TableCell>{row.name}</TableCell>
              <TableCell className="font-mono text-mono">{row.prefix ?? DASH}</TableCell>
              <TableCell className="font-mono text-mono">{row.scopes.join(", ")}</TableCell>
              <TableCell numeric>{formatDateTime(row.createdAt)}</TableCell>
              <TableCell numeric>{row.expiresAt ? formatDateTime(row.expiresAt) : "Never"}</TableCell>
              <TableCell numeric>{row.lastUsedAt ? formatDateTime(row.lastUsedAt) : DASH}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Panel>
  );
}
