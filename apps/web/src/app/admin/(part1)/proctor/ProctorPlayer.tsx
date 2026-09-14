"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Badge, Button, SkeletonPanel } from "@moj/ui";
import { useQuery } from "convex/react";
import { Radio, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { formatDateTime } from "@/lib/format";

/** A slice boundary wider than this is a gap rather than the usual few frames. */
const GAP_MS = 8_000;

/**
 * Watching one session, live or afterwards.
 *
 * Live is not playback. Following shows the newest slice and holds its last
 * frame until the next one lands — a window onto what they are doing now,
 * without a scrubber inviting anybody to treat it as a recording. Playback is
 * the recording, and gets the controls.
 */
export function ProctorPlayer({
  sessionId,
  startAt,
  onClose,
}: {
  sessionId: Id<"proctorSessions">;
  startAt?: number;
  onClose?: () => void;
}) {
  const t = useTranslations("admin.proctor");
  const data = useQuery(api.proctor.replay, { sessionId });

  const [at, setAt] = useState(0);
  const [following, setFollowing] = useState(true);

  const chunks = data?.chunks ?? [];
  const live = data?.session.live ?? false;

  // Opening at a particular moment means looking at that moment, not at now —
  // but only when it is asked for, once. `chunks` is a fresh array every time a
  // slice lands, so without the guard this fired on every new slice and threw
  // the viewer out of following a second after they chose it.
  const jumped = useRef<number | null>(null);
  useEffect(() => {
    if (startAt === undefined || chunks.length === 0) return;
    if (jumped.current === startAt) return;
    const index = chunks.findIndex((chunk) => chunk.index === startAt);
    if (index >= 0) {
      jumped.current = startAt;
      setFollowing(false);
      setAt(index);
    }
  }, [startAt, chunks]);

  useEffect(() => {
    if (following && chunks.length > 0) setAt(chunks.length - 1);
  }, [following, chunks.length]);

  // Following a session that has ended means nothing.
  useEffect(() => {
    if (!live) setFollowing(false);
  }, [live]);

  if (data === undefined) return <SkeletonPanel lines={4} />;
  if (data === null) return <p className="text-sm text-muted-foreground">{t("missing")}</p>;

  const { session } = data;
  const current = chunks[at] ?? null;
  const expected = chunks.length > 0 ? (chunks[chunks.length - 1]?.index ?? 0) + 1 : 0;
  const missing = expected - chunks.length;
  const watchingLive = following && live;

  return (
    <div className="rounded-md border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <span className="font-medium">{session.displayName}</span>
        {session.live ? (
          <Badge variant="good" shape="square">
            {t("live")}
          </Badge>
        ) : (
          <Badge variant="neutral" shape="square">
            {session.endedReason ?? t("lapsed")}
          </Badge>
        )}
        <span className="text-sm text-muted-foreground tabular-nums">
          {t("slices", { count: chunks.length })}
          {session.bytes > 0 ? ` · ${(session.bytes / 1_000_000).toFixed(1)} MB` : ""}
          {missing > 0 ? ` · ${t("missingSlices", { count: missing })}` : ""}
        </span>
        {onClose ? (
          <Button size="sm" variant="secondary" className="ml-auto" onClick={onClose}>
            <X size={14} aria-hidden />
            <span className="sr-only">{t("close")}</span>
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 p-3">
        {chunks.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noRecording")}</p>
        ) : (
          <>
            <video
              key={current?.url ?? "none"}
              src={current?.url ?? undefined}
              // Live is a frame, not a recording: no scrubber, nothing to drag.
              controls={!watchingLive}
              autoPlay
              muted
              playsInline
              className="w-full rounded-md border border-border bg-black"
              onEnded={() => {
                if (!following && at + 1 < chunks.length) setAt(at + 1);
              }}
            />

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant={watchingLive ? "primary" : "secondary"}
                onClick={() => setFollowing((on) => !on)}
                disabled={!live}
              >
                <Radio size={14} aria-hidden />
                {watchingLive ? t("followingNow") : t("follow")}
              </Button>
              <span className="text-sm text-muted-foreground tabular-nums">
                {current ? formatDateTime(current.startedAt) : ""}
                {chunks.length > 0 ? ` · ${at + 1}/${chunks.length}` : ""}
              </span>
            </div>

            {/* Every slice, with gaps drawn as gaps. */}
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
                      className={`h-5 w-2 rounded-xs ${
                        index === at ? "bg-primary" : gap ? "bg-warning-ink" : "bg-secondary"
                      }`}
                    />
                  </span>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
