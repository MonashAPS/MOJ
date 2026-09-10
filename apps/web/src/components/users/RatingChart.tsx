"use client";

import { cn, ratingClass, ratingTitle } from "@moj/ui";
import { useRouter } from "next/navigation";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDate } from "@/lib/format";

export type RatingPoint = {
  label: string;
  contestKey: string;
  rating: number;
  ranking: number;
  timestamp: number;
};

/** `user-about.html`'s `yHighlight`: DMOJ's bands, drawn from the tokens so both
 *  themes get the right value without a second table. */
const BANDS: { from: number; to: number; token: string }[] = [
  { from: 0, to: 1000, token: "--rating-newbie" },
  { from: 1000, to: 1300, token: "--rating-amateur" },
  { from: 1300, to: 1600, token: "--rating-expert" },
  { from: 1600, to: 1900, token: "--rating-candidate-master" },
  { from: 1900, to: 2400, token: "--rating-master" },
  { from: 2400, to: 3000, token: "--rating-grandmaster" },
  { from: 3000, to: 4000, token: "--rating-target" },
];

type Payload = { payload?: RatingPoint }[];

function RatingTooltip({ active, payload }: { active?: boolean; payload?: Payload }) {
  const point = active ? payload?.[0]?.payload : undefined;
  if (!point) return null;
  return (
    <div className="rounded-md border border-border bg-popover p-3 shadow-2">
      <p className="text-base font-medium text-foreground">{point.label}</p>
      <p className="font-mono text-sm tabular-nums text-muted-foreground">{formatDate(point.timestamp)}</p>
      <p className="mt-1 font-mono text-mono tabular-nums">
        <span className={cn("rating", ratingClass(point.rating))} title={ratingTitle(point.rating)}>
          {point.rating}
        </span>
        <span className="text-muted-foreground">, #{point.ranking}</span>
      </p>
    </div>
  );
}

/** The rating history scatter DMOJ draws with Chart.js, as one Recharts line with
 *  the rating bands behind it. A point links to that contest's ranking. */
export function RatingChart({ points }: { points: RatingPoint[] }) {
  const router = useRouter();
  if (points.length === 0) return null;

  const ratings = points.map((point) => point.rating);
  const low = Math.max(0, Math.min(...ratings) - 50);
  const high = Math.max(...ratings) + 50;

  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={points}
          margin={{ top: 8, right: 12, bottom: 4, left: 0 }}
          onClick={(state) => {
            // `activePayload` is on the runtime object but not on Recharts'
            // published handler type, so it is read through a narrow shape.
            const active = (state as { activePayload?: { payload?: RatingPoint }[] } | undefined)
              ?.activePayload;
            const point = active?.[0]?.payload;
            if (point) router.push(`/contest/${point.contestKey}/ranking/`);
          }}
        >
          {BANDS.map((band) => (
            <ReferenceArea
              key={band.token}
              y1={band.from}
              y2={band.to}
              fill={`var(${band.token})`}
              fillOpacity={0.16}
              ifOverflow="hidden"
              strokeOpacity={0}
            />
          ))}
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis
            dataKey="timestamp"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(value: number) => formatDate(value)}
            tick={{ fill: "var(--muted)", fontSize: 11, fontFamily: "var(--font-mono)" }}
            stroke="var(--line-strong)"
            minTickGap={40}
          />
          <YAxis
            domain={[low, high]}
            allowDecimals={false}
            width={44}
            tick={{ fill: "var(--muted)", fontSize: 11, fontFamily: "var(--font-mono)" }}
            stroke="var(--line-strong)"
          />
          <Tooltip content={<RatingTooltip />} cursor={{ stroke: "var(--line-strong)" }} />
          <Line
            type="linear"
            dataKey="rating"
            stroke="var(--accent)"
            strokeWidth={2}
            isAnimationActive={false}
            dot={{ r: 4, fill: "var(--surface)", stroke: "var(--accent)", strokeWidth: 2 }}
            activeDot={{ r: 5, fill: "var(--accent)", stroke: "var(--surface)", strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
