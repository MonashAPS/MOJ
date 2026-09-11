"use client";

import { cn, ratingClass, ratingTitle } from "@moj/ui";
import { useEffect, useRef, useState } from "react";
import { formatDate } from "@/lib/format";
import {
  buildRatingChart,
  CHART_HEIGHT,
  CHART_MIN_WIDTH,
  CHART_WIDTH,
  type ChartDot,
  type RatingPoint,
} from "./rating-chart";

export type { RatingPoint } from "./rating-chart";

const AXIS_FONT = { fontFamily: "var(--font-mono)", fontSize: 11 };
/** How far the pointer may sit from a point and still pick it up. */
const HIT_RADIUS = 11;
/** Above this the tooltip would leave the panel, so it hangs below the point. */
const TOOLTIP_FLIP = 92;
const TOOLTIP_EDGE = 90;

function signed(delta: number) {
  return delta > 0 ? `+${delta}` : `${delta}`;
}

function describe(dot: ChartDot) {
  const move = dot.delta === null ? "" : ` (${signed(dot.delta)})`;
  return `${dot.point.label}: rating ${dot.point.rating}${move}, rank #${dot.point.ranking} on ${formatDate(dot.point.timestamp)}`;
}

function RatingValue({ rating }: { rating: number }) {
  return (
    <span className={cn("rating", ratingClass(rating))} title={ratingTitle(rating)}>
      {rating}
    </span>
  );
}

function Tooltip({ dot, width }: { dot: ChartDot; width: number }) {
  // A point near the top has no room for a card above it, and one near an edge
  // would hang out of the panel, so both are nudged back inside.
  const below = dot.y < TOOLTIP_FLIP;
  const left = Math.min(Math.max(dot.x, TOOLTIP_EDGE), Math.max(TOOLTIP_EDGE, width - TOOLTIP_EDGE));
  return (
    <div
      role="status"
      className={cn(
        "pointer-events-none absolute z-(--z-tooltip) w-max max-w-64 -translate-x-1/2",
        below ? "translate-y-0" : "-translate-y-full",
        "rounded-md border border-border bg-popover p-2 shadow-2",
      )}
      style={{ left, top: below ? dot.y + 12 : dot.y - 10 }}
    >
      <p className="truncate text-base font-medium text-foreground">{dot.point.label}</p>
      <p className="font-mono text-xs tabular-nums text-muted-foreground">
        {formatDate(dot.point.timestamp)}
      </p>
      <p className="mt-1 font-mono text-mono tabular-nums">
        <RatingValue rating={dot.point.rating} />
        {dot.delta === null ? null : (
          <span className={dot.delta < 0 ? "text-danger-ink" : "text-success-ink"}> {signed(dot.delta)}</span>
        )}
        <span className="text-muted-foreground"> · rank #{dot.point.ranking}</span>
      </p>
    </div>
  );
}

/**
 * The rating history DMOJ draws with Chart.js, as one SVG: the rating bands as
 * background stripes, a line through every rated contest, and a point per
 * contest that links to that contest's ranking. The panel is drawn even with no
 * history — bands, axis and an empty state — so the About tab keeps its shape.
 */
export function RatingChart({ points }: { points: RatingPoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(CHART_WIDTH);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      const measured = entry?.contentRect.width ?? 0;
      if (measured > 0) setWidth(Math.max(CHART_MIN_WIDTH, Math.round(measured)));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const chart = buildRatingChart(points, width, CHART_HEIGHT);
  const activeDot = chart.dots.find((dot) => dot.key === active) ?? null;

  return (
    <div ref={containerRef} className="relative w-full" style={{ height: CHART_HEIGHT }}>
      <svg
        width={chart.width}
        height={chart.height}
        viewBox={`0 0 ${chart.width} ${chart.height}`}
        className="block"
      >
        <title>Rating history</title>
        {/* biome-ignore lint/a11y/noAriaHiddenOnFocusable: the bands, grid and axis hold nothing focusable — the links sit outside this group */}
        <g aria-hidden="true">
          {chart.bands.map((band) => (
            <rect
              key={band.token}
              x={chart.plot.x}
              y={band.y}
              width={chart.plot.width}
              height={band.height}
              fill={`var(${band.token})`}
              fillOpacity={0.16}
            />
          ))}

          {chart.yTicks.map((tick) => (
            <g key={tick.value}>
              <line
                x1={chart.plot.x}
                x2={chart.plot.x + chart.plot.width}
                y1={tick.y}
                y2={tick.y}
                stroke="var(--line)"
              />
              <text
                x={chart.plot.x - 8}
                y={tick.y}
                textAnchor="end"
                dominantBaseline="middle"
                fill="var(--muted)"
                style={AXIS_FONT}
              >
                {tick.value}
              </text>
            </g>
          ))}

          {chart.xTicks.map((tick) => (
            <text
              key={tick.value}
              x={tick.x}
              y={chart.plot.y + chart.plot.height + 16}
              textAnchor={tick.anchor}
              dominantBaseline="hanging"
              fill="var(--muted)"
              style={AXIS_FONT}
            >
              {formatDate(tick.value)}
            </text>
          ))}

          <line
            x1={chart.plot.x}
            x2={chart.plot.x}
            y1={chart.plot.y}
            y2={chart.plot.y + chart.plot.height}
            stroke="var(--line-strong)"
          />
          <line
            x1={chart.plot.x}
            x2={chart.plot.x + chart.plot.width}
            y1={chart.plot.y + chart.plot.height}
            y2={chart.plot.y + chart.plot.height}
            stroke="var(--line-strong)"
          />

          {chart.line ? (
            <path d={chart.line} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" />
          ) : null}
        </g>

        {chart.dots.map((dot) => (
          <a
            key={dot.key}
            href={`/contest/${dot.point.contestKey}/ranking/`}
            aria-label={describe(dot)}
            onMouseEnter={() => setActive(dot.key)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(dot.key)}
            onBlur={() => setActive(null)}
          >
            {/* The reachable target, wider than the point it sits on. */}
            <circle cx={dot.x} cy={dot.y} r={HIT_RADIUS} fill="transparent" />
            <circle
              cx={dot.x}
              cy={dot.y}
              r={dot.key === active ? 5.5 : 4}
              fill="var(--surface)"
              stroke="var(--accent)"
              strokeWidth={2}
              className="cursor-pointer"
            />
          </a>
        ))}
      </svg>

      {activeDot ? <Tooltip dot={activeDot} width={chart.width} /> : null}

      {chart.dots.length === 0 ? (
        <p className="absolute inset-0 flex items-center justify-center text-base text-muted-foreground">
          No rated contests yet.
        </p>
      ) : null}
    </div>
  );
}
