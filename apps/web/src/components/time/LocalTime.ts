"use client";

import { createElement } from "react";
import { useDateFormatters, useRelativeReferenceTime } from "@/lib/date-format";
import { formatRelative } from "@/lib/format";

type TimeProps = {
  value: number;
  className?: string;
};

/** Uses the serialized timezone for hydration, then follows the browser timezone. */
export function LocalTime({
  value,
  format = "dateTime",
  className,
}: TimeProps & { format?: "date" | "dateTime" | "absolute" }) {
  const { formatDate, formatDateTime, absoluteTime } = useDateFormatters();
  const label = format === "date" ? formatDate : format === "absolute" ? absoluteTime : formatDateTime;

  return createElement(
    "time",
    { dateTime: new Date(value).toISOString(), title: formatDateTime(value), className },
    label(value),
  );
}

/** Relative labels update together on the shared minute clock. */
export function RelativeTime({ value, relativeWithin, className }: TimeProps & { relativeWithin?: number }) {
  const now = useRelativeReferenceTime();
  const { formatDate, formatDateTime } = useDateFormatters();

  return createElement(
    "time",
    { dateTime: new Date(value).toISOString(), title: formatDateTime(value), className },
    relativeWithin === undefined || now - value < relativeWithin
      ? formatRelative(value, now)
      : formatDate(value),
  );
}
