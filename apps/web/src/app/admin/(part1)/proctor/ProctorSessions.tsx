"use client";

import { api } from "@convex/_generated/api";
import { Badge, Button, EmptyState, Field, Select } from "@moj/ui";
import { useQuery } from "convex/react";
import { MonitorOff } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { AdminShell } from "@/components/admin";
import { formatDateTime } from "@/lib/format";

/** Windows the timeline can show, as milliseconds back from now. */
const WINDOWS = [
  { value: "3600000", hours: 1 },
  { value: "21600000", hours: 6 },
  { value: "86400000", hours: 24 },
  { value: "604800000", hours: 168 },
];

/** Recordings are megabytes, always, so one unit keeps the column comparable. */
function megabytes(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

/**
 * A colour per contest, stable across renders and rows.
 *
 * Which hue a contest gets does not matter; that two rows agree does, because
 * the whole point of the strip is seeing that two people were in the same place
 * at the same time.
 */
function hue(key: string): number {
  let total = 0;
  for (let i = 0; i < key.length; i += 1) total = (total * 31 + key.charCodeAt(i)) % 360;
  return total;
}

/**
 * Who was being watched, and when.
 *
 * Proctoring is not a contest's to own — a session spans whatever the person
 * happens to do — so this is drawn against time, and the contest is a property
 * of the moment rather than of the session.
 */
export function ProctorSessions() {
  const t = useTranslations("admin.proctor");
  const states = useTranslations("common.states");

  const [since, setSince] = useState("86400000");
  const [username, setUsername] = useState("");
  const [contestKey, setContestKey] = useState("");

  const data = useQuery(api.proctor.timeline, {
    sinceMs: Number(since),
    ...(username ? { username } : {}),
    ...(contestKey ? { contestKey } : {}),
  });

  const people = useMemo(() => [...new Set((data?.rows ?? []).map((row) => row.username))].sort(), [data]);

  const breadcrumb = [{ label: t("breadcrumbConsole"), href: "/admin/" }, { label: t("title") }];
  const span = data ? Math.max(1, data.to - data.from) : 1;

  return (
    <AdminShell title={t("title")} breadcrumb={breadcrumb}>
      <div className="grid gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t("window")} className="w-40">
            <Select
              value={since}
              onValueChange={setSince}
              options={WINDOWS.map((w) => ({ value: w.value, label: t("lastHours", { count: w.hours }) }))}
            />
          </Field>
          <Field label={t("user")} className="w-48">
            <Select
              value={username || "__all__"}
              onValueChange={(value) => setUsername(value === "__all__" ? "" : value)}
              options={[
                { value: "__all__", label: t("everyone") },
                ...people.map((name) => ({ value: name, label: name })),
              ]}
            />
          </Field>
          <Field label={t("contest")} className="w-56">
            <Select
              value={contestKey || "__all__"}
              onValueChange={(value) => setContestKey(value === "__all__" ? "" : value)}
              options={[
                { value: "__all__", label: t("anyContest") },
                ...(data?.contests ?? []).map((c) => ({ value: c.key, label: c.name })),
              ]}
            />
          </Field>
        </div>

        {data === undefined ? (
          <p className="text-sm text-muted-foreground">{states("loading")}</p>
        ) : data.rows.length === 0 ? (
          <EmptyState
            icon={<MonitorOff aria-hidden />}
            title={t("emptyTitle")}
            description={t("emptyBody")}
          />
        ) : (
          <div className="grid gap-2">
            <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
              <span>{formatDateTime(data.from)}</span>
              <span>{formatDateTime(data.to)}</span>
            </div>

            {data.rows.map((row) => (
              <div key={row.sessionId} className="rounded-md border border-border bg-card p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="font-medium">{row.displayName}</span>
                  {row.live ? (
                    <Badge variant="good" shape="square">
                      {t("live")}
                    </Badge>
                  ) : (
                    <Badge variant="neutral" shape="square">
                      {row.endedReason ?? t("lapsed")}
                    </Badge>
                  )}
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {t("slices", { count: row.slices.length })} · {megabytes(row.bytes)}
                  </span>
                  <Button asChild size="sm" variant="secondary" className="ml-auto">
                    <Link href={`/admin/proctor/${row.sessionId}/`}>
                      {row.live ? t("watchLive") : t("watch")}
                    </Link>
                  </Button>
                </div>

                {/* Each slice drawn where it happened. A gap in the strip is a
                    gap in the recording, which is the thing worth seeing. */}
                <div className="relative h-7 overflow-hidden rounded bg-secondary">
                  {row.slices.map((slice) => {
                    const left = ((slice.startedAt - data.from) / span) * 100;
                    const width = Math.max((slice.durationMs / span) * 100, 0.35);
                    const label = slice.contestKey
                      ? `${formatDateTime(slice.startedAt)} · ${slice.contestKey}`
                      : formatDateTime(slice.startedAt);
                    return (
                      <Link
                        key={slice.index}
                        href={`/admin/proctor/${row.sessionId}/?at=${slice.index}`}
                        title={label}
                        aria-label={label}
                        className="absolute top-0 h-full"
                        style={{
                          left: `${left}%`,
                          width: `${width}%`,
                          backgroundColor: slice.contestKey
                            ? `hsl(${hue(slice.contestKey)} 70% 45%)`
                            : "hsl(215 15% 55%)",
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            ))}

            {(data.contests.length > 0 || data.rows.length > 0) && (
              <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-muted-foreground">
                {data.contests.map((contest) => (
                  <span key={contest.key} className="flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className="size-3 rounded-xs"
                      style={{ backgroundColor: `hsl(${hue(contest.key)} 70% 45%)` }}
                    />
                    {contest.name}
                  </span>
                ))}
                <span className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="size-3 rounded-xs"
                    style={{ backgroundColor: "hsl(215 15% 55%)" }}
                  />
                  {t("noContest")}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
