"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Alert, AlertTitle, Badge, Button, Panel } from "@moj/ui";
import { useQuery } from "convex/react";
import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { AdminShell } from "@/components/admin";
import { formatDateTime } from "@/lib/format";

/**
 * Play back a session.
 *
 * The slices cannot be played one at a time. MediaRecorder writes the WebM
 * header into the first one only and the rest are bare continuation clusters,
 * so they are fetched in order and joined back into the single stream they were
 * cut from before anything can play it.
 */
export function ProctorReplay({ sessionId }: { sessionId: Id<"proctorSessions"> }) {
  const t = useTranslations("admin.proctor");
  const states = useTranslations("common.states");
  const data = useQuery(api.proctor.replay, { sessionId });

  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const urlRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  const assemble = useCallback(async () => {
    if (!data) return;
    setLoading(true);
    setFailed(false);
    try {
      const parts: BlobPart[] = [];
      for (const chunk of data.chunks) {
        if (!chunk.url) continue;
        parts.push(await (await fetch(chunk.url)).blob());
      }
      if (parts.length === 0) {
        setFailed(true);
        return;
      }
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const url = URL.createObjectURL(new Blob(parts, { type: "video/webm" }));
      urlRef.current = url;
      setSrc(url);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [data]);

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

  const { session, chunks } = data;
  // A hole in the sequence is an upload that never arrived, which is a
  // different thing from someone stopping, and worth saying so.
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
            {missing > 0 ? ` · ${t("missingSlices", { count: missing })}` : ""}
          </p>
          {session.contestKey ? (
            <p>
              <Link href={`/contest/${session.contestKey}/`}>{session.contestKey}</Link>
            </p>
          ) : null}
        </Panel>

        <Panel title={t("replay")} bodyClassName="grid gap-3 p-4">
          {failed ? (
            <Alert variant="danger">
              <TriangleAlert size={16} aria-hidden />
              <AlertTitle>{t("replayFailed")}</AlertTitle>
            </Alert>
          ) : null}

          {src ? (
            // biome-ignore lint/a11y/useMediaCaption: a screen recording has none.
            <video src={src} controls className="w-full rounded-md border border-border" />
          ) : (
            <div>
              <Button onClick={() => void assemble()} busy={loading} disabled={chunks.length === 0}>
                {t("assemble")}
              </Button>
              <p className="mt-2 text-sm text-muted-foreground">{t("assembleHint")}</p>
            </div>
          )}
        </Panel>
      </div>
    </AdminShell>
  );
}
