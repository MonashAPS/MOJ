"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { PROCTOR_TERMS_VERSION } from "@moj/core";
import { Button, Checkbox } from "@moj/ui";
import { useMutation, useQuery } from "convex/react";
import { Check, MonitorPlay, ShieldCheck, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

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
 * The Chromium version that began reporting `displaySurface` in track settings,
 * which is the only way to tell a whole screen from a window after the fact.
 * Below it the check would pass vacuously and proctoring would be a formality.
 */
const MIN_CHROMIUM = 92;

type BrowserCheck = { ok: boolean; name: string | null; version: number | null };

/** Convex's upload endpoint answers `{storageId}`. The id's brand is nominal, so
 *  a present string is as far as a runtime check can go. */
function isUploadAnswer(body: unknown): body is { storageId: Id<"_storage"> } {
  return (
    typeof body === "object" && body !== null && "storageId" in body && typeof body.storageId === "string"
  );
}

/** Screen-capture options newer than the DOM typings: they keep the picker on
 *  whole screens rather than offering a tab or a window. */
type ScreenCaptureOptions = DisplayMediaStreamOptions & {
  monitorTypeSurfaces?: "include" | "exclude";
  selfBrowserSurface?: "include" | "exclude";
  surfaceSwitching?: "include" | "exclude";
};

/**
 * Which browser this is, and whether it can be proctored.
 *
 * Firefox reports almost nothing in `getSettings` and Safari reports only a
 * frame rate, so neither can be held to sharing a whole screen. Rather than
 * accept a check that cannot fail, they are turned away and told what to use.
 */
type UserAgentBrand = { brand: string; version: string };

function isUserAgentBrand(value: unknown): value is UserAgentBrand {
  return (
    typeof value === "object" &&
    value !== null &&
    "brand" in value &&
    typeof value.brand === "string" &&
    "version" in value &&
    typeof value.version === "string"
  );
}

function hasBrandList(data: unknown): data is { brands: unknown[] } {
  return typeof data === "object" && data !== null && "brands" in data && Array.isArray(data.brands);
}

/** Chromium's user-agent client hints, which the DOM typings do not carry. */
function userAgentBrands(): UserAgentBrand[] {
  if (!("userAgentData" in navigator)) return [];
  const data: unknown = navigator.userAgentData;

  return hasBrandList(data) ? data.brands.filter(isUserAgentBrand) : [];
}

function checkBrowser(): BrowserCheck {
  const agent = navigator.userAgent;

  for (const brand of userAgentBrands()) {
    if (/microsoft edge/i.test(brand.brand)) {
      const version = Number.parseInt(brand.version, 10);

      return { ok: version >= MIN_CHROMIUM, name: "Edge", version };
    }

    if (/google chrome/i.test(brand.brand)) {
      const version = Number.parseInt(brand.version, 10);

      return { ok: version >= MIN_CHROMIUM, name: "Chrome", version };
    }
  }

  const edge = /Edg\/(\d+)/.exec(agent);

  if (edge?.[1]) {
    const version = Number.parseInt(edge[1], 10);

    return { ok: version >= MIN_CHROMIUM, name: "Edge", version };
  }

  // Opera and friends carry Chrome/ in the agent as well; they are Chromium and
  // report the same settings, but naming them here would be guesswork.
  const chrome = /Chrome\/(\d+)/.exec(agent);

  if (chrome?.[1] && !/OPR\//.test(agent)) {
    const version = Number.parseInt(chrome[1], 10);

    return { ok: version >= MIN_CHROMIUM, name: "Chrome", version };
  }

  const name = /Firefox\//.test(agent) ? "Firefox" : /Safari\//.test(agent) ? "Safari" : null;

  return { ok: false, name, version: null };
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
  const [agreed, setAgreed] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const sessionRef = useRef<Id<"proctorSessions"> | null>(null);
  const indexRef = useRef(0);

  const [browser, setBrowser] = useState<BrowserCheck | null>(null);
  useEffect(() => {
    const check = checkBrowser();
    setBrowser(check);

    if (!check.ok) setPhase("unsupported");
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

        const answer: unknown = await response.json();

        if (!isUploadAnswer(answer)) throw new Error("the upload endpoint returned no storage id");
        const { storageId } = answer;
        await addChunk({
          sessionId,
          storageId,
          index,
          startedAt,
          durationMs: Math.max(0, Date.now() - startedAt),
          bytes: blob.size,
          mimeType: blob.type || "video/webm",
        });
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
      const constraints: ScreenCaptureOptions = {
        // A hint only: the browser may still offer tabs and windows, so what
        // they actually picked is checked below rather than assumed.
        video: { displaySurface: "monitor" },
        audio: false,
        monitorTypeSurfaces: "include",
        selfBrowserSurface: "exclude",
        surfaceSwitching: "exclude",
      };

      stream = await navigator.mediaDevices.getDisplayMedia(constraints);
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
      ({ sessionId } = await start({
        displaySurface: surface,
        userAgent: navigator.userAgent,
        termsVersion: PROCTOR_TERMS_VERSION,
      }));
    } catch (caught) {
      for (const each of stream.getTracks()) each.stop();
      setError(caught instanceof Error ? caught.message : t("failed"));
      setPhase("idle");

      return;
    }

    streamRef.current = stream;
    sessionRef.current = sessionId;
    indexRef.current = 0;

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

  const live = phase === "sharing" || state?.active === true;
  const step = !browser ? 0 : !browser.ok ? 1 : !agreed ? 2 : 3;

  // Once it is running there is nothing left to do and nothing worth reading.
  // The one thing that matters is not closing the tab, so that is all it says.
  if (live) {
    return (
      <div className="grid gap-5 py-2 text-center">
        <ShieldCheck size={44} aria-hidden className="mx-auto text-success-ink" />
        <div>
          <p className="font-display text-h2 font-semibold tracking-tight">{t("liveTitle")}</p>
          <p className="mt-2 text-base font-medium text-warning-ink">{t("liveKeepOpen")}</p>
        </div>
        <div>
          <Button variant="secondary" size="sm" onClick={() => void finish("stopped")}>
            {t("stop")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <Step
        index={1}
        current={step}
        title={t("stepBrowser")}
        done={browser?.ok === true}
        failed={browser !== null && !browser.ok}
      >
        {browser === null ? (
          <p className="text-sm text-muted-foreground">{t("checking")}</p>
        ) : browser.ok ? (
          <p className="text-sm text-muted-foreground">
            {t("browserOk", { name: browser.name ?? "Chromium", version: browser.version ?? 0 })}
          </p>
        ) : (
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">{t("browserWrong")}</p>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="secondary">
                <a href="https://www.google.com/chrome/" target="_blank" rel="noreferrer noopener">
                  {t("getChrome", { min: MIN_CHROMIUM })}
                </a>
              </Button>
              <Button asChild size="sm" variant="secondary">
                <a href="https://www.microsoft.com/edge/download" target="_blank" rel="noreferrer noopener">
                  {t("getEdge", { min: MIN_CHROMIUM })}
                </a>
              </Button>
            </div>
          </div>
        )}
      </Step>

      <Step index={2} current={step} title={t("stepTerms")} done={agreed}>
        <div className="grid gap-3">
          <p className="text-sm text-muted-foreground">{t("termsIntro")}</p>
          <ul className="grid list-disc gap-1.5 pl-5 text-sm text-muted-foreground">
            {TERMS.map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ul>
          <Checkbox
            checked={agreed}
            disabled={!browser?.ok}
            onCheckedChange={(value) => setAgreed(value === true)}
            label={t("termsAgree")}
          />
        </div>
      </Step>

      <Step index={3} current={step} title={t("stepShare")} done={false}>
        <div className="grid gap-3">
          <p className="text-sm text-muted-foreground">{t("stepShareBody")}</p>

          {phase === "wrongSurface" ? <Note tone="warning" text={t("wholeScreenBody")} /> : null}
          {phase === "denied" ? <Note tone="warning" text={t("deniedBody")} /> : null}
          {phase === "stopped" ? <Note tone="warning" text={t("stoppedBody")} /> : null}
          {error ? <Note tone="danger" text={error} /> : null}

          <div>
            <Button
              onClick={() => void begin()}
              busy={phase === "starting"}
              disabled={!browser?.ok || !agreed}
            >
              <MonitorPlay size={16} aria-hidden />
              {t("share")}
            </Button>
          </div>
        </div>
      </Step>

      <Step index={4} current={step} title={t("stepKeep")} done={false}>
        <p className="text-sm text-muted-foreground">{t("stepKeepBody")}</p>
      </Step>
    </div>
  );
}

/** The proctoring terms, one line each, in the order they are read. */
const TERMS = ["termsRetention", "termsUse", "termsNoSale", "termsNoSharing", "termsScope"] as const;

/** One numbered step, dimmed until it is this one's turn. */
function Step({
  index,
  current,
  title,
  done,
  failed = false,
  children,
}: {
  index: number;
  current: number;
  title: string;
  done: boolean;
  failed?: boolean;
  children: ReactNode;
}) {
  const active = current === index;

  return (
    <section className={active || done || failed ? "" : "opacity-50"}>
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <span
          aria-hidden
          className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
            failed
              ? "bg-danger-ink text-background"
              : done
                ? "bg-success-ink text-background"
                : active
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground"
          }`}
        >
          {done && !failed ? <Check size={13} aria-hidden /> : index}
        </span>
        {title}
      </h2>
      <div className="mt-2 pl-8">{children}</div>
    </section>
  );
}

function Note({ tone, text }: { tone: "warning" | "danger"; text: string }) {
  return (
    <p
      role={tone === "danger" ? "alert" : undefined}
      className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
        tone === "danger" ? "border-danger-ink/30 text-danger-ink" : "border-warning-ink/30 text-warning-ink"
      }`}
    >
      <TriangleAlert size={15} aria-hidden className="mt-0.5 shrink-0" />
      <span>{text}</span>
    </p>
  );
}
