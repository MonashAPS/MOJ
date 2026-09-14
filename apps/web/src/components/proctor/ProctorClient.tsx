"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Alert, AlertDescription, AlertTitle, Button, Panel } from "@moj/ui";
import { useMutation, useQuery } from "convex/react";
import { MonitorPlay, ShieldCheck, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

/** How often the page tells the server it is still holding the stream. */
const HEARTBEAT_MS = 10_000;

/**
 * How much recording goes in one slice.
 *
 * Every slice is a separate upload, so shorter loses less when one fails and
 * costs more requests. Five seconds keeps a dropped slice small enough not to
 * matter and the request rate low enough to ignore.
 */
const SLICE_MS = 5_000;

/**
 * Each slice is a complete WebM file rather than a piece of one.
 *
 * `MediaRecorder.start(timeslice)` is cheaper — it emits continuation clusters
 * with no header — but then one failed upload corrupts every slice after it,
 * and nothing can be played without first fetching the whole recording. A
 * recorder restarted per slice costs a keyframe each time and buys a recording
 * where a lost slice is a gap and nothing more, playable from any point.
 *
 * The restart is driven by the recorder's own `dataavailable`, which the native
 * encoder times. A `setInterval` would be throttled to once a minute the moment
 * the tab went to the background, which is the case this exists to cover.
 */

/** Only a whole screen counts; a window or a tab shows us what they chose. */
const REQUIRED_SURFACE = "monitor";

type Phase = "idle" | "starting" | "sharing" | "stopped" | "wrongSurface" | "denied" | "unsupported";

/**
 * Chrome and Edge report a full `displaySurface`, which is what makes "they
 * really shared the whole screen" checkable. Firefox reports almost nothing and
 * Safari reports only a frame rate, so the check would pass vacuously there.
 * Proctored contests are Chromium-only on purpose.
 */
function isChromium(): boolean {
  const brands = (navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } }).userAgentData
    ?.brands;
  if (brands?.length) {
    return brands.some((b) => /chromium|google chrome|microsoft edge/i.test(b.brand));
  }
  return /Chrome\/|Edg\//.test(navigator.userAgent) && !/OPR\//.test(navigator.userAgent);
}

export function ProctorClient() {
  const t = useTranslations("common.proctor");
  const state = useQuery(api.proctor.state, {});
  const start = useMutation(api.proctor.start);
  const heartbeat = useMutation(api.proctor.heartbeat);
  const stop = useMutation(api.proctor.stop);
  const uploadUrl = useMutation(api.proctor.uploadUrl);
  const addChunk = useMutation(api.proctor.addChunk);

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const sessionRef = useRef<Id<"proctorSessions"> | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const indexRef = useRef(0);

  useEffect(() => {
    if (!isChromium()) setPhase("unsupported");
  }, []);

  /** Tear the local half down. The server's session ends by going quiet. */
  const teardown = useCallback(() => {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    // Drop the stream first: the slice loop restarts itself from `onstop` and
    // checks for one, so clearing it is what makes the last stop the last.
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }, []);

  const finish = useCallback(
    async (reason: string) => {
      const sessionId = sessionRef.current;
      sessionRef.current = null;
      teardown();
      setPhase("stopped");
      if (sessionId) await stop({ sessionId, reason }).catch(() => undefined);
    },
    [stop, teardown],
  );

  const send = useCallback(
    async (blob: Blob, startedAt: number) => {
      const sessionId = sessionRef.current;
      if (!sessionId || blob.size === 0) return;
      const index = indexRef.current++;
      try {
        const url = await uploadUrl({});
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": blob.type || "video/webm" },
          body: blob,
        });
        const { storageId } = (await response.json()) as { storageId: Id<"_storage"> };
        await addChunk({
          sessionId,
          storageId,
          index,
          startedAt,
          durationMs: Math.max(0, Date.now() - startedAt),
          bytes: blob.size,
          mimeType: blob.type || "video/webm",
        });
        setUploaded((n) => n + 1);
      } catch {
        // A dropped slice leaves a hole in the index, which the timeline shows
        // as a gap rather than pretending the recording was continuous.
      }
    },
    [addChunk, uploadUrl],
  );

  const begin = useCallback(async () => {
    setError(null);
    setPhase("starting");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        // A hint only: the browser may still offer tabs and windows, so what
        // they actually picked is checked below rather than assumed.
        video: { displaySurface: "monitor" },
        audio: false,
        monitorTypeSurfaces: "include",
        selfBrowserSurface: "exclude",
        surfaceSwitching: "exclude",
      } as DisplayMediaStreamOptions);
    } catch {
      setPhase("denied");
      return;
    }

    const [track] = stream.getVideoTracks();
    const surface = track?.getSettings().displaySurface;
    if (surface !== REQUIRED_SURFACE) {
      for (const each of stream.getTracks()) each.stop();
      setPhase("wrongSurface");
      return;
    }

    let sessionId: Id<"proctorSessions">;
    try {
      ({ sessionId } = await start({ displaySurface: surface, userAgent: navigator.userAgent }));
    } catch (caught) {
      for (const each of stream.getTracks()) each.stop();
      setError(caught instanceof Error ? caught.message : t("failed"));
      setPhase("idle");
      return;
    }

    streamRef.current = stream;
    sessionRef.current = sessionId;
    indexRef.current = 0;
    setUploaded(0);
    if (videoRef.current) videoRef.current.srcObject = stream;

    // Stopping from the browser's own sharing bar has to end the session too.
    track?.addEventListener("ended", () => void finish("sharing stopped"));

    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : "video/webm";

    const recordSlice = () => {
      if (!streamRef.current) return;
      const recorder = new MediaRecorder(streamRef.current, { mimeType, videoBitsPerSecond: 400_000 });
      const startedAt = Date.now();
      const parts: Blob[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) parts.push(event.data);
        // The first one lands on the encoder's own clock; stopping here flushes
        // the rest and closes the file.
        if (recorder.state === "recording") recorder.stop();
      };
      recorder.onstop = () => {
        void send(new Blob(parts, { type: mimeType }), startedAt);
        recordSlice();
      };

      recorder.start(SLICE_MS);
      recorderRef.current = recorder;
    };

    recordSlice();
    setPhase("sharing");
  }, [finish, send, start, t]);

  // The heartbeat is what keeps the questions open, so it runs for as long as
  // the stream does and stops the moment it does not.
  useEffect(() => {
    if (phase !== "sharing") return;
    const timer = setInterval(() => {
      const sessionId = sessionRef.current;
      if (!sessionId) return;
      void heartbeat({ sessionId }).then((result) => {
        // A newer tab took the stream over; this one is no longer the session.
        if (!result.ok) void finish("replaced");
      });
    }, HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [phase, heartbeat, finish]);

  // Closing the tab should end it now rather than after the window lapses.
  useEffect(() => {
    const onUnload = () => {
      const sessionId = sessionRef.current;
      if (sessionId) void stop({ sessionId, reason: "closed the tab" });
    };
    window.addEventListener("pagehide", onUnload);
    return () => window.removeEventListener("pagehide", onUnload);
  }, [stop]);

  useEffect(() => teardown, [teardown]);

  if (phase === "unsupported") {
    return (
      <Alert variant="danger">
        <TriangleAlert size={16} aria-hidden />
        <AlertTitle>{t("chromeOnly")}</AlertTitle>
        <AlertDescription>{t("chromeOnlyBody")}</AlertDescription>
      </Alert>
    );
  }

  const live = phase === "sharing" || state?.active === true;

  return (
    <div className="grid gap-4">
      {error ? (
        <Alert variant="danger" role="alert">
          <TriangleAlert size={16} aria-hidden />
          <AlertTitle>{error}</AlertTitle>
        </Alert>
      ) : null}

      {phase === "wrongSurface" ? (
        <Alert variant="warning">
          <TriangleAlert size={16} aria-hidden />
          <AlertTitle>{t("wholeScreenTitle")}</AlertTitle>
          <AlertDescription>{t("wholeScreenBody")}</AlertDescription>
        </Alert>
      ) : null}

      {phase === "denied" ? (
        <Alert variant="warning">
          <TriangleAlert size={16} aria-hidden />
          <AlertTitle>{t("deniedTitle")}</AlertTitle>
          <AlertDescription>{t("deniedBody")}</AlertDescription>
        </Alert>
      ) : null}

      {phase === "stopped" ? (
        <Alert variant="warning">
          <TriangleAlert size={16} aria-hidden />
          <AlertTitle>{t("stoppedTitle")}</AlertTitle>
          <AlertDescription>{t("stoppedBody")}</AlertDescription>
        </Alert>
      ) : null}

      <Panel title={live ? t("watchingTitle") : t("idleTitle")} bodyClassName="grid gap-4 p-4">
        <p className="text-sm text-muted-foreground">{live ? t("watchingBody") : t("idleBody")}</p>

        {live ? (
          <div className="flex items-center gap-2 text-sm">
            <ShieldCheck size={16} aria-hidden className="text-success-ink" />
            <span>{t("uploaded", { count: uploaded })}</span>
          </div>
        ) : null}

        <div>
          {live ? (
            <Button variant="secondary" onClick={() => void finish("stopped")}>
              {t("stop")}
            </Button>
          ) : (
            <Button onClick={() => void begin()} busy={phase === "starting"}>
              <MonitorPlay size={16} aria-hidden />
              {t("share")}
            </Button>
          )}
        </div>

        {/* Their own view of what is being sent. Seeing it is what stops "is
            this actually recording?" being a question. */}
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className={live ? "w-full max-w-md rounded-md border border-border" : "hidden"}
        >
          <track kind="captions" />
        </video>
      </Panel>
    </div>
  );
}
