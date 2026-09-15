"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { Timeline } from "@convex/proctor";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { formatDateTime } from "@/lib/format";

const MINUTE = 60_000;

const HOUR = 60 * MINUTE;

/** A break longer than this starts a new bar rather than widening the old one. */
const GAP_MS = 20_000;

/** Room for the axis labels, which are angled and so need more than a line. */
const AXIS_HEIGHT = 46;

const LANE_HEIGHT = 26;

const LANE_GAP = 4;

/**
 * A colour per contest, stable across bars, so two people in the same contest
 * at the same time are obviously in the same contest.
 */
function hue(key: string): number {
  let total = 0;

  for (let i = 0; i < key.length; i += 1) total = (total * 31 + key.charCodeAt(i)) % 360;

  return total;
}

export function colourFor(contestKey: string | null): string {
  return contestKey ? `hsl(${hue(contestKey)} 65% 42%)` : "hsl(215 12% 50%)";
}

export type Segment = {
  sessionId: Id<"proctorSessions">;
  username: string;
  displayName: string;
  contestKey: string | null;
  from: number;
  to: number;
  /** The slice to open, and to preview on hover. */
  firstIndex: number;
  live: boolean;
};

/**
 * Slices collapsed into bars.
 *
 * A bar is a run of recording by one person with one contest behind it, so a
 * bar ends when they stop, when the recording drops, or when they move between
 * contests — each of which is a thing worth seeing as a boundary.
 */
export function segmentsOf(data: Timeline): Segment[] {
  const out: Segment[] = [];

  for (const row of data.rows) {
    let current: Segment | null = null;

    for (const slice of row.slices) {
      const contiguous =
        current !== null && slice.contestKey === current.contestKey && slice.startedAt - current.to <= GAP_MS;

      if (contiguous && current) {
        current.to = slice.startedAt + slice.durationMs;
        continue;
      }

      if (current) out.push(current);
      current = {
        sessionId: row.sessionId,
        username: row.username,
        displayName: row.displayName,
        contestKey: slice.contestKey,
        from: slice.startedAt,
        to: slice.startedAt + slice.durationMs,
        firstIndex: slice.index,
        live: row.live,
      };
    }

    if (current) out.push(current);
  }

  return out.sort((a, b) => a.from - b.from);
}

/**
 * Pack bars into as few lanes as will hold them.
 *
 * Lanes are not people. Two bars sit on the same line whenever their times do
 * not run into each other, whoever they belong to, which keeps a sparse chart
 * short enough to read. The name is on the bar, so nothing is lost by it.
 */
function pack(segments: Segment[], msPerPixel: number): Segment[][] {
  // Bars need room for their label, so they claim a little more than they take.
  const padding = msPerPixel * 8;
  const lanes: { end: number; items: Segment[] }[] = [];

  for (const segment of segments) {
    const lane = lanes.find((candidate) => candidate.end + padding <= segment.from);

    if (lane) {
      lane.end = segment.to;
      lane.items.push(segment);
    } else {
      lanes.push({ end: segment.to, items: [segment] });
    }
  }

  return lanes.map((lane) => lane.items);
}

/** Ticks a person can read; the label tightens as the window does. */
function ticksFor(from: number, to: number, count: number): { at: number; label: string }[] {
  const span = to - from;
  const withDate = span > 12 * HOUR;
  const out: { at: number; label: string }[] = [];

  for (let i = 0; i <= count; i += 1) {
    const at = from + (span * i) / count;
    const date = new Date(at);
    const time = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    out.push({
      at,
      label: withDate
        ? `${date.toLocaleDateString(undefined, { day: "numeric", month: "short" })} ${time}`
        : time,
    });
  }

  return out;
}

function duration(ms: number): string {
  const seconds = Math.round(ms / 1000);

  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;

  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** The frame under the cursor, fetched only once somebody hovers. */
function Preview({ segment }: { segment: Segment }) {
  const url = useQuery(api.proctor.sliceUrl, {
    sessionId: segment.sessionId,
    index: segment.firstIndex,
  });

  if (!url) return <div className="h-28 w-48 animate-pulse rounded bg-secondary" />;

  return (
    <video
      src={url}
      muted
      playsInline
      preload="metadata"
      className="h-28 w-48 rounded bg-black object-cover"
    />
  );
}

export function ProctorChart({
  data,
  onPick,
  selected,
}: {
  data: Timeline;
  onPick: (segment: Segment) => void;
  selected: Segment | null;
}) {
  const t = useTranslations("admin.proctor");
  const [hovered, setHovered] = useState<Segment | null>(null);

  const segments = useMemo(() => segmentsOf(data), [data]);

  // Fit to what there actually is, so bars are wide enough to carry a name
  // rather than being slivers in a mostly empty day.
  const bounds = useMemo(() => {
    if (segments.length === 0) return { from: data.from, to: data.to };
    const first = Math.min(...segments.map((s) => s.from));
    const last = Math.max(...segments.map((s) => s.to));
    const pad = Math.max((last - first) * 0.05, 30_000);

    return { from: first - pad, to: last + pad };
  }, [segments, data.from, data.to]);

  const span = Math.max(1, bounds.to - bounds.from);
  const lanes = useMemo(() => pack(segments, span / 900), [segments, span]);
  const ticks = ticksFor(bounds.from, bounds.to, Math.min(8, Math.max(3, lanes.length + 3)));

  const left = (at: number) => ((at - bounds.from) / span) * 100;

  return (
    <div className="relative">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: dismissing a hover
          card when the pointer leaves the plot is not an interaction of its own;
          every focusable thing inside is a button. */}
      <div
        className="relative"
        style={{ height: lanes.length * (LANE_HEIGHT + LANE_GAP) + AXIS_HEIGHT }}
        onMouseLeave={() => setHovered(null)}
      >
        {/* Gridlines, drawn behind everything and stopping at the axis. */}
        {ticks.map((tick) => (
          <span
            key={tick.at}
            aria-hidden
            className="absolute top-0 w-px bg-border"
            style={{ left: `${left(tick.at)}%`, height: lanes.length * (LANE_HEIGHT + LANE_GAP) }}
          />
        ))}

        {lanes.map((lane, index) => (
          <div
            key={lane[0] ? `${lane[0].sessionId}-${lane[0].from}` : index}
            className="absolute inset-x-0"
            style={{ top: index * (LANE_HEIGHT + LANE_GAP), height: LANE_HEIGHT }}
          >
            {lane.map((segment) => {
              const width = Math.max(left(segment.to) - left(segment.from), 0.6);

              const isSelected =
                selected?.sessionId === segment.sessionId && selected?.firstIndex === segment.firstIndex;

              return (
                <button
                  type="button"
                  key={`${segment.sessionId}-${segment.firstIndex}`}
                  onMouseEnter={() => setHovered(segment)}
                  onFocus={() => setHovered(segment)}
                  onClick={() => onPick(segment)}
                  className={`absolute inset-y-0 flex items-center overflow-hidden rounded px-1.5 text-left text-xs font-medium text-white transition-[outline] ${
                    isSelected ? "outline-2 outline-offset-1 outline-foreground" : ""
                  }`}
                  style={{
                    left: `${left(segment.from)}%`,
                    width: `${width}%`,
                    backgroundColor: colourFor(segment.contestKey),
                  }}
                >
                  <span className="truncate drop-shadow-sm">{segment.displayName}</span>
                </button>
              );
            })}
          </div>
        ))}

        {/* The axis sits under the chart, angled, the way a chart's does. */}
        <div className="absolute inset-x-0" style={{ top: lanes.length * (LANE_HEIGHT + LANE_GAP) }}>
          <div className="h-px w-full bg-border" />
          {ticks.map((tick) => (
            <span
              key={tick.at}
              className="absolute origin-top-left -rotate-[32deg] whitespace-nowrap pt-1.5 text-[11px] tabular-nums text-muted-foreground"
              style={{ left: `${left(tick.at)}%` }}
            >
              {tick.label}
            </span>
          ))}
        </div>
      </div>

      {hovered ? (
        <div
          className="pointer-events-none absolute z-10 w-52 rounded-md border border-border bg-card p-2 shadow-lg"
          style={{
            left: `min(max(${left(hovered.from)}%, 0px), calc(100% - 13rem))`,
            top: -8,
            transform: "translateY(-100%)",
          }}
        >
          <Preview segment={hovered} />
          <p className="mt-2 truncate text-sm font-medium">{hovered.displayName}</p>
          <p className="text-xs text-muted-foreground tabular-nums">{formatDateTime(hovered.from)}</p>
          <p className="text-xs text-muted-foreground">
            {duration(hovered.to - hovered.from)}
            {hovered.contestKey ? ` · ${hovered.contestKey}` : ` · ${t("noContest")}`}
          </p>
        </div>
      ) : null}
    </div>
  );
}
