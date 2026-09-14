"use client";

import { api } from "@convex/_generated/api";
import { Button, Combobox, EmptyState, Field, SkeletonTable } from "@moj/ui";
import { useQuery } from "convex/react";
import { ChevronLeft, ChevronRight, MonitorOff, Trophy, User, ZoomIn, ZoomOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { AdminShell } from "@/components/admin";
import { colourFor, ProctorChart, type Segment } from "./ProctorChart";
import { ProctorPlayer } from "./ProctorPlayer";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * Who was being watched, and when.
 *
 * One chart rather than a table of sessions: proctoring is not a contest's to
 * own and a session is not a row of anything, so what is drawn is time, with
 * each stretch of recording labelled by whose it is and coloured by what they
 * were doing. Picking a bar opens it underneath rather than on a page of its
 * own, so the chart stays in view while you watch.
 */
export function ProctorSessions() {
  const t = useTranslations("admin.proctor");

  // How much history to fetch. The chart fits itself to whatever came back, so
  // this is a reach rather than a window.
  const [span, setSpan] = useState(7 * 24 * HOUR);
  const [endOffset, setEndOffset] = useState(0);
  const [username, setUsername] = useState("");
  const [contestKey, setContestKey] = useState("");
  const [selected, setSelected] = useState<Segment | null>(null);

  // Span and offset, never a timestamp computed here: an absolute bound would
  // be a new value on every render, and a query whose arguments never settle
  // never resolves. The server reads the clock.
  const data = useQuery(api.proctor.timeline, {
    spanMs: span,
    endOffsetMs: endOffset,
    ...(username ? { username } : {}),
    ...(contestKey ? { contestKey } : {}),
  });

  const people = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of data?.rows ?? []) seen.set(row.username, row.displayName);
    return [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [data]);

  const breadcrumb = [{ label: t("breadcrumbConsole"), href: "/admin/" }, { label: t("title") }];

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
                ...people.map(([name, displayName]) => ({
                  value: name,
                  label: displayName,
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
              onClick={() => setSpan((s) => Math.min(s * 2, 90 * 24 * HOUR))}
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
          <SkeletonTable rows={4} columns={3} />
        ) : data.rows.length === 0 ? (
          <EmptyState
            icon={<MonitorOff aria-hidden />}
            title={t("emptyTitle")}
            description={t("emptyBody")}
          />
        ) : (
          <ProctorChart data={data} selected={selected} onPick={setSelected} />
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

        {selected ? (
          <ProctorPlayer
            key={`${selected.sessionId}-${selected.firstIndex}`}
            sessionId={selected.sessionId}
            startAt={selected.firstIndex}
            onClose={() => setSelected(null)}
          />
        ) : null}
      </div>
    </AdminShell>
  );
}
