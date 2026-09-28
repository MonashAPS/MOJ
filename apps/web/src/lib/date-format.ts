"use client";

import {
  createContext,
  createElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createDateFormatters, TIMEZONE_COOKIE, validTimeZone } from "./date-formatters";
import { formatRelative } from "./format";

const TimeZoneContext = createContext<string | null>(null);

const ReferenceTimeContext = createContext(0);

const DateFormattersContext = createContext(createLocalFormatters(null));

function createLocalFormatters(timeZone: string | null) {
  const { formatDate, formatDateTime, absoluteTime } = createDateFormatters(timeZone, 0);

  return { formatDate, formatDateTime, absoluteTime };
}

export function DateFormatProvider({
  initialTimeZone,
  initialNow,
  children,
}: {
  initialTimeZone: string | null;
  initialNow: number;
  children?: ReactNode;
}) {
  const [now, setNow] = useState(initialNow);
  useEffect(() => {
    const tick = () => setNow(Date.now());

    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };

    tick();
    const interval = setInterval(tick, 60_000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  const [browserTimeZone, setBrowserTimeZone] = useState<string | null>(null);
  useEffect(() => {
    let lastTimeZone = initialTimeZone;

    function syncTimeZone() {
      const detected = validTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);

      if (!detected || detected === lastTimeZone) return;
      lastTimeZone = detected;
      setBrowserTimeZone(detected);
      // biome-ignore lint/suspicious/noDocumentCookie: also support browsers without Cookie Store.
      document.cookie = `${TIMEZONE_COOKIE}=${detected}; Path=/; Max-Age=31536000; SameSite=Lax`;
    }

    function onVisible() {
      if (document.visibilityState === "visible") syncTimeZone();
    }

    syncTimeZone();
    window.addEventListener("focus", syncTimeZone);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.removeEventListener("focus", syncTimeZone);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [initialTimeZone]);
  const timeZone = browserTimeZone ?? initialTimeZone;
  const formatters = useMemo(() => createLocalFormatters(timeZone), [timeZone]);

  return createElement(
    ReferenceTimeContext.Provider,
    { value: now },
    createElement(
      TimeZoneContext.Provider,
      { value: timeZone },
      createElement(DateFormattersContext.Provider, { value: formatters }, children),
    ),
  );
}

export function useDateFormatters() {
  return useContext(DateFormattersContext);
}

/** Reuse the serialized time for hydration, then follow the shared minute clock. */
export function useRelativeReferenceTime() {
  return useContext(ReferenceTimeContext);
}

export function useRelativeTimeFormatter() {
  const now = useRelativeReferenceTime();

  return useCallback((ms: number) => formatRelative(ms, now), [now]);
}

export function useViewerTimeZone() {
  return useContext(TimeZoneContext);
}
