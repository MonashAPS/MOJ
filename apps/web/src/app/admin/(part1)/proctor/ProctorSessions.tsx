"use client";

import { api } from "@convex/_generated/api";
import { Badge, Button, Combobox, EmptyState, Field } from "@moj/ui";
import { useQuery } from "convex/react";
import { ChevronLeft, ChevronRight, MonitorOff, Trophy, User, ZoomIn, ZoomOut } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { AdminShell } from "@/components/admin";
import { formatDateTime } from "@/lib/format";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** How many ticks fit across the axis without crowding. */
const TICKS = 6;

/**
 * A colour per contest, stable across rows.
 *
 * Which hue a contest gets does not matter; that two rows agree does, because
 * the point of the chart is seeing two people in the same place at once.
 */
function hue(key: string): number {
  let total = 0;
  for (let i = 0; i < key.length; i += 1) total = (total * 31 + key.charCodeAt(i)) % 360;
  return total;
}

function colourFor(contestKey: string | null): string {
  return contestKey ? `hsl(${hue(contestKey)} 70% 45%)` : "hsl(215 12% 58%)";
}

/** Ticks a person can read: the label tightens as the window does. */
function ticksFor(from: number, to: number): { at: number; label: string }[] {
  const span = to - from;
  const showDate = span > 12 * HOUR;
  const out: { at: number; label: string }[] = [];
  for (let i = 0; i <= TICKS; i += 1) {
    const at = from + (span * i) / TICKS;
    const date = new Date(at);
    const time = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    out.push({
      at,
      label: showDate
        ? `${date.toLocaleDateString(undefined, { day: "numeric", month: "short" })} ${time}`
        : time,
    });
  }
  return out;
}

/**
 * Who was being watched, and when.
 *
 * One chart: time across, people down. Proctoring is not a contest's to own —
 * a session spans whatever the person happens to do — so the contest is a
 * property of each moment and shows as its colour, which is what makes two
 * people being in the same contest at the same time visible at a glance.
 */
export function ProctorSessions() {
  const t = useTranslations("admin.proctor");
  const states = useTranslations("common.states");

  // The window is held as a span and an end, so zooming keeps the right edge
  // still and panning moves both together.
  const [span, setSpan] = useState(24 * HOUR);
  const [endOffset, setEndOffset] = useState(0);
  const [username, setUsername] = useState("");
  const [contestKey, setContestKey] = useState("");

  // Span and offset, never a timestamp computed here: an absolute bound would
  // be a new value on every render, and a query whose arguments never settle
  // never resolves. The server reads the clock.
  const data = useQuery(api.proctor.timeline, {
    spanMs: span,
    endOffsetMs: endOffset,
    ...(username ? { username } : {}),
    ...(contestKey ? { contestKey } : {}),
  });

  /** One row per person, however many sessions they had. */
  const people = useMemo(() => {
    const byUser = new Map<string, { displayName: string; rows: NonNullable<typeof data>["rows"] }>();
    for (const row of data?.rows ?? []) {
      const entry = byUser.get(row.username) ?? { displayName: row.displayName, rows: [] };
      entry.rows.push(row);
      byUser.set(row.username, entry);
    }
    return [...byUser.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [data]);

  const breadcrumb = [{ label: t("breadcrumbConsole"), href: "/admin/" }, { label: t("title") }];
  const from = data?.from ?? 0;
  const to = data?.to ?? 1;
  const width = Math.max(1, to - from);
  const ticks = data ? ticksFor(from, to) : [];

  return (
    <AdminShell title={t("title")} breadcrumb={breadcrumb}>
      <div className="grid gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t("user")} className="w-56">
            <Combobox
              value={username}
              onValueChange={setUsername}
              placeholder={t("everyone")}
              searchPlaceholder={t("searchUser")}
              options={[
                { value: "", label: t("everyone") },
                ...people.map(([name, entry]) => ({
                  value: name,
                  label: entry.displayName,
                  hint: <User size={14} aria-hidden />,
                })),
              ]}
            />
          </Field>
          <Field label={t("contest")} className="w-64">
            <Combobox
              value={contestKey}
              onValueChange={setContestKey}
              placeholder={t("anyContest")}
              searchPlaceholder={t("searchContest")}
              options={[
                { value: "", label: t("anyContest") },
                ...(data?.contests ?? []).map((contest) => ({
                  value: contest.key,
                  label: contest.name,
                  hint: <Trophy size={14} aria-hidden style={{ color: colourFor(contest.key) }} />,
                })),
              ]}
            />
          </Field>

          <div className="flex items-end gap-1">
            <Button size="sm" variant="secondary" onClick={() => setEndOffset((o) => o + span / 4)}>
              <ChevronLeft size={14} aria-hidden />
              <span className="sr-only">{t("panBack")}</span>
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setSpan((s) => Math.min(s * 2, 30 * 24 * HOUR))}
            >
              <ZoomOut size={14} aria-hidden />
              <span className="sr-only">{t("zoomOut")}</span>
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setSpan((s) => Math.max(s / 2, 5 * MINUTE))}>
              <ZoomIn size={14} aria-hidden />
              <span className="sr-only">{t("zoomIn")}</span>
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setEndOffset((o) => Math.max(0, o - span / 4))}
              disabled={endOffset === 0}
            >
              <ChevronRight size={14} aria-hidden />
              <span className="sr-only">{t("panForward")}</span>
            </Button>
            <Button
              size="sm"
              variant={endOffset === 0 ? "primary" : "secondary"}
              onClick={() => setEndOffset(0)}
            >
              {t("now")}
            </Button>
          </div>
        </div>

        {data === undefined ? (
          <p className="text-sm text-muted-foreground">{states("loading")}</p>
        ) : people.length === 0 ? (
          <EmptyState
            icon={<MonitorOff aria-hidden />}
            title={t("emptyTitle")}
            description={t("emptyBody")}
          />
        ) : (
          <div className="rounded-md border border-border bg-card">
            {/* The axis, drawn once above every row. */}
            <div className="flex border-b border-border">
              <div className="w-32 shrink-0 border-r border-border px-2 py-1 text-xs text-muted-foreground">
                {t("whenLabel")}
              </div>
              <div className="relative h-6 flex-1">
                {ticks.map((tick) => (
                  <span
                    key={tick.at}
                    className="absolute top-1 -translate-x-1/2 whitespace-nowrap text-xs tabular-nums text-muted-foreground"
                    style={{ left: `${((tick.at - from) / width) * 100}%` }}
                  >
                    {tick.label}
                  </span>
                ))}
              </div>
            </div>

            {/* People down, scrolling when there are more than fit. */}
            <div className="max-h-[28rem] overflow-y-auto scroll-quiet">
              {people.map(([name, entry]) => (
                <div key={name} className="flex border-b border-border last:border-b-0">
                  <div className="flex w-32 shrink-0 items-center gap-1.5 overflow-hidden border-r border-border px-2 py-1.5">
                    <span className="truncate text-sm font-medium" title={entry.displayName}>
                      {entry.displayName}
                    </span>
                    {entry.rows.some((row) => row.live) ? (
                      <Badge variant="good" shape="square">
                        {t("live")}
                      </Badge>
                    ) : null}
                  </div>

                  <div className="relative h-9 flex-1 bg-secondary/40">
                    {ticks.map((tick) => (
                      <span
                        key={tick.at}
                        aria-hidden
                        className="absolute inset-y-0 w-px bg-border"
                        style={{ left: `${((tick.at - from) / width) * 100}%` }}
                      />
                    ))}
                    {entry.rows.flatMap((row) =>
                      row.slices.map((slice) => {
                        const left = ((slice.startedAt - from) / width) * 100;
                        const w = Math.max((slice.durationMs / width) * 100, 0.3);
                        const label = slice.contestKey
                          ? `${entry.displayName} · ${formatDateTime(slice.startedAt)} · ${slice.contestKey}`
                          : `${entry.displayName} · ${formatDateTime(slice.startedAt)}`;
                        return (
                          <Link
                            key={`${row.sessionId}-${slice.index}`}
                            href={`/admin/proctor/${row.sessionId}/?at=${slice.index}`}
                            title={label}
                            aria-label={label}
                            className="absolute inset-y-1.5 rounded-xs transition-opacity hover:opacity-75"
                            style={{
                              left: `${left}%`,
                              width: `${w}%`,
                              backgroundColor: colourFor(slice.contestKey),
                            }}
                          />
                        );
                      }),
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {data && data.contests.length > 0 ? (
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {data.contests.map((contest) => (
              <span key={contest.key} className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="size-3 rounded-xs"
                  style={{ backgroundColor: colourFor(contest.key) }}
                />
                {contest.name}
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="size-3 rounded-xs" style={{ backgroundColor: colourFor(null) }} />
              {t("noContest")}
            </span>
          </div>
        ) : null}
      </div>
    </AdminShell>
  );
}
