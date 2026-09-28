"use client";

import { useCountdownNow } from "./CountdownProvider";

/** `HH:MM:SS` under a day, `Nd HH:MM` above it, so only the seconds digit
 *  repaints on a tick and the width stays put. */
export function formatDuration(ms: number): string {
  if (ms <= 0) return "00:00:00";
  const total = Math.floor(ms / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");

  return days > 0
    ? `${days}d ${pad(hours)}:${pad(minutes)}`
    : `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/** Past this a countdown stops being information: DMOJ's open-ended tutorial
 *  contests run to the year 9999, and "2911825d" is not a deadline. */
export const COUNTDOWN_HORIZON = 100 * 24 * 3600_000;

/** Returns the milliseconds left until `endsAt`, using the shared live clock. */
export function useCountdown(endsAt: number | null | undefined): number | null {
  const now = useCountdownNow();

  // Outside the root provider (for example, an isolated component render), use
  // a deterministic empty state until a provider is supplied rather than
  // consulting the server and browser clocks independently.
  if (!endsAt || now === null) return null;

  return Math.max(0, endsAt - now);
}
