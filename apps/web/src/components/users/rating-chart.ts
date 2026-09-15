export type RatingPoint = {
  label: string;
  contestKey: string;
  rating: number;
  ranking: number;
  timestamp: number;
};

/** `user-about.html`'s `yHighlight`: DMOJ's bands, drawn from the tokens so both
 *  themes get the right value without a second table. */
const RATING_BANDS: readonly { from: number; to: number; token: string }[] = [
  { from: 0, to: 1000, token: "--rating-newbie" },
  { from: 1000, to: 1300, token: "--rating-amateur" },
  { from: 1300, to: 1600, token: "--rating-expert" },
  { from: 1600, to: 1900, token: "--rating-candidate-master" },
  { from: 1900, to: 2400, token: "--rating-master" },
  { from: 2400, to: 3000, token: "--rating-grandmaster" },
  { from: 3000, to: 4000, token: "--rating-target" },
];

export const CHART_HEIGHT = 260;

/** What the server renders with, before the client has measured its container. */
export const CHART_WIDTH = 760;

export const CHART_MIN_WIDTH = 320;

const PADDING = { top: 14, right: 16, bottom: 28, left: 48 };

/** With no history there is nothing to scale to, so the axis covers the bands a
 *  rated user is most likely to land in and the panel keeps its shape. */
const EMPTY_DOMAIN = { low: 800, high: 2400 };

/** A single contest would otherwise scale to a 100 point window. */
const MIN_SPAN = 200;

const PAD_RATING = 50;

/** The coarsest step, which is also what a span wider than every candidate uses. */
const WIDEST_STEP = 2000;

const STEP_CANDIDATES = [50, 100, 200, 250, 500, 1000, WIDEST_STEP];

const MAX_Y_TICKS = 6;

const MAX_X_TICKS = 5;

/** A date label is about 90px wide, so this is the room two of them need. */
const X_TICK_SPACING = 130;

type ChartBand = { token: string; y: number; height: number };

type ChartYTick = { value: number; y: number };

/** The end labels are anchored inwards so they cannot spill out of the panel. */
type ChartXTick = { value: number; x: number; anchor: "start" | "middle" | "end" };

export type ChartDot = {
  key: string;
  x: number;
  y: number;
  /** The rating gained or lost since the previous contest; null for the first. */
  delta: number | null;
  point: RatingPoint;
};

export type RatingChartGeometry = {
  width: number;
  height: number;
  plot: { x: number; y: number; width: number; height: number };
  domain: { low: number; high: number };
  bands: ChartBand[];
  yTicks: ChartYTick[];
  xTicks: ChartXTick[];
  dots: ChartDot[];
  /** The rating line as an SVG path, empty when there is no history. */
  line: string;
};

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function ratingDomain(points: readonly RatingPoint[]) {
  if (points.length === 0) return EMPTY_DOMAIN;
  const ratings = points.map((point) => point.rating);
  let low = Math.min(...ratings) - PAD_RATING;
  let high = Math.max(...ratings) + PAD_RATING;

  if (high - low < MIN_SPAN) {
    const middle = (high + low) / 2;
    low = middle - MIN_SPAN / 2;
    high = middle + MIN_SPAN / 2;
  }

  return {
    low: Math.max(0, Math.floor(low / PAD_RATING) * PAD_RATING),
    high: Math.ceil(high / PAD_RATING) * PAD_RATING,
  };
}

function tickStep(span: number) {
  for (const step of STEP_CANDIDATES) {
    if (span / step <= MAX_Y_TICKS) return step;
  }

  return WIDEST_STEP;
}

/** The whole chart as numbers: the component only turns these into elements, so
 *  the shape of the line is testable without a DOM. */
export function buildRatingChart(
  points: readonly RatingPoint[],
  width = CHART_WIDTH,
  height = CHART_HEIGHT,
): RatingChartGeometry {
  const plot = {
    x: PADDING.left,
    y: PADDING.top,
    width: Math.max(1, width - PADDING.left - PADDING.right),
    height: Math.max(1, height - PADDING.top - PADDING.bottom),
  };

  const domain = ratingDomain(points);
  const span = domain.high - domain.low;

  const yFor = (rating: number) => round(plot.y + plot.height - ((rating - domain.low) / span) * plot.height);

  const first = points[0];
  const last = points[points.length - 1];
  const timeSpan = first && last ? last.timestamp - first.timestamp : 0;

  const xFor = (timestamp: number) => {
    if (!first || timeSpan <= 0) return round(plot.x + plot.width / 2);

    return round(plot.x + ((timestamp - first.timestamp) / timeSpan) * plot.width);
  };

  const bands: ChartBand[] = [];

  for (const band of RATING_BANDS) {
    const from = Math.max(band.from, domain.low);
    const to = Math.min(band.to, domain.high);

    if (to <= from) continue;
    const y = yFor(to);
    bands.push({ token: band.token, y, height: round(yFor(from) - y) });
  }

  const step = tickStep(span);
  const yTicks: ChartYTick[] = [];

  for (let value = Math.ceil(domain.low / step) * step; value <= domain.high; value += step) {
    yTicks.push({ value, y: yFor(value) });
  }

  const xTicks: ChartXTick[] = [];

  if (first && last) {
    const fit = Math.max(2, Math.min(MAX_X_TICKS, Math.floor(plot.width / X_TICK_SPACING)));
    const count = timeSpan <= 0 ? 1 : Math.min(fit, Math.max(2, points.length));

    for (let index = 0; index < count; index++) {
      const value =
        count === 1 ? first.timestamp : Math.round(first.timestamp + (timeSpan * index) / (count - 1));

      const anchor =
        count === 1 || (index > 0 && index < count - 1) ? "middle" : index === 0 ? "start" : "end";

      xTicks.push({ value, x: xFor(value), anchor });
    }
  }

  const dots: ChartDot[] = points.map((point, index) => {
    const previous = points[index - 1];

    return {
      key: `${point.contestKey}-${point.timestamp}`,
      x: xFor(point.timestamp),
      y: yFor(point.rating),
      delta: previous ? point.rating - previous.rating : null,
      point,
    };
  });

  const line = dots.map((dot, index) => `${index === 0 ? "M" : "L"} ${dot.x} ${dot.y}`).join(" ");

  return { width, height, plot, domain, bands, yTicks, xTicks, dots, line };
}
