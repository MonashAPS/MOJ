"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Alert, AlertTitle, Badge, Button, Panel } from "@moj/ui";
import { useQuery } from "convex/react";
import { Radio, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { AdminShell } from "@/components/admin";
import { formatDateTime } from "@/lib/format";

/** A slice boundary wider than this is a gap rather than the usual few frames. */
const GAP_MS = 8_000;

/**
 * Watch a session, live or afterwards.
 *
 * Each slice is a complete file, so playback is a playlist rather than a
 * stream: the video plays one and moves to the next, and following a live
 * session is just jumping to whichever slice arrived most recently. Convex
 * pushes new slices as they land, so nothing here polls.
 */
export function ProctorReplay({ sessionId }: { sessionId: Id<"proctorSessions"> }) {
  const t = useTranslations("admin.proctor");
  const states = useTranslations("common.states");
  const data = useQuery(api.proctor.replay, { sessionId });

  const [at, setAt] = useState(0);
  const [following, setFollowing] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const chunks = data?.chunks ?? [];
  const live = data?.session.live ?? false;

  // Following means the newest slice, which is what "watch this person now"
  // means. Any manual jump stops it, so a click does not fight the stream.
  useEffect(() => {
    if (following && chunks.length > 0) setAt(chunks.length - 1);
  }, [following, chunks.length]);

  const current = chunks[at] ?? null;

  const breadcrumb = [
    { label: t("breadcrumbConsole"), href: "/admin/" },
    { label: t("title"), href: "/admin/proctor/" },
    { label: data?.session.username ?? "…" },
  ];

  if (data === undefined) {
    return (
      <AdminShell title={t("title")} breadcrumb={breadcrumb}>
        <p className="text-sm text-muted-foreground">{states("loading")}</p>
      </AdminShell>
    );
  }
  if (data === null) {
    return (
      <AdminShell title={t("title")} breadcrumb={breadcrumb}>
        <Alert variant="danger">
          <TriangleAlert size={16} aria-hidden />
          <AlertTitle>{t("missing")}</AlertTitle>
        </Alert>
      </AdminShell>
    );
  }

  const { session } = data;
  // A hole in the numbering is an upload that never arrived, which is not the
  // same as somebody stopping, and worth telling apart.
  const expected = chunks.length > 0 ? (chunks[chunks.length - 1]?.index ?? 0) + 1 : 0;
  const missing = expected - chunks.length;

  return (
    <AdminShell
      title={session.displayName}
      breadcrumb={breadcrumb}
      action={
        session.live ? (
          <Badge variant="good" shape="square">
            {t("live")}
          </Badge>
        ) : (
          <Badge variant="neutral" shape="square">
            {session.endedReason ?? t("lapsed")}
          </Badge>
        )
      }
    >
      <div className="grid gap-4">
        <Panel title={t("details")} bodyClassName="grid gap-2 p-4 text-sm">
          <p>
            {t("startedAt", { at: formatDateTime(session.startedAt) })} ·{" "}
            {t("lastSeenAt", { at: formatDateTime(session.lastSeenAt) })}
          </p>
          <p>
            {t("slices", { count: chunks.length })}
            {session.bytes > 0 ? ` · ${(session.bytes / 1_000_000).toFixed(1)} MB` : ""}
            {missing > 0 ? ` · ${t("missingSlices", { count: missing })}` : ""}
          </p>
          {session.contestKey ? (
            <p>
              <Link href={`/contest/${session.contestKey}/`}>{session.contestKey}</Link>
            </p>
          ) : null}
        </Panel>

        <Panel title={t("replay")} bodyClassName="grid gap-3 p-4">
          {chunks.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noRecording")}</p>
          ) : (
            <>
              <video
                ref={videoRef}
                key={current?.url ?? "none"}
                src={current?.url ?? undefined}
                controls
                autoPlay
                muted
                className="w-full rounded-md border border-border bg-black"
                onEnded={() => {
                  // Roll into the next slice, or sit on the last one and wait
                  // for the person being watched to produce another.
                  if (at + 1 < chunks.length) setAt(at + 1);
                }}
              />

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant={following ? "primary" : "secondary"}
                  onClick={() => setFollowing((on) => !on)}
                  disabled={!live}
                >
                  <Radio size={14} aria-hidden />
                  {t("follow")}
                </Button>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {current ? formatDateTime(current.startedAt) : ""}
                  {chunks.length > 0 ? ` · ${at + 1}/${chunks.length}` : ""}
                </span>
              </div>

              {/* The timeline. A wide boundary is drawn as a gap so a drop is
                  visible rather than something you have to notice missing. */}
              <div className="flex flex-wrap gap-px">
                {chunks.map((chunk, index) => {
                  const previous = chunks[index - 1];
                  const gap = previous
                    ? chunk.startedAt - (previous.startedAt + previous.durationMs) > GAP_MS
                    : false;
                  return (
                    <span key={chunk.index} className="flex items-center gap-px">
                      {gap ? <span className="w-2" title={t("gap")} aria-hidden /> : null}
                      <button
                        type="button"
                        title={formatDateTime(chunk.startedAt)}
                        aria-label={formatDateTime(chunk.startedAt)}
                        onClick={() => {
                          setFollowing(false);
                          setAt(index);
                        }}
                        className={`h-6 w-2 rounded-xs ${
                          index === at ? "bg-primary" : gap ? "bg-warning-ink" : "bg-secondary"
                        }`}
                      />
                    </span>
                  );
                })}
              </div>
            </>
          )}
        </Panel>
      </div>
    </AdminShell>
  );
}
