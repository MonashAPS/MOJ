import { describe, expect, it } from "vitest";
import { buildRatingChart, CHART_HEIGHT, CHART_WIDTH, type RatingPoint } from "./rating-chart";

const HISTORY: RatingPoint[] = [
  { label: "Round 1", contestKey: "r1", rating: 1287, ranking: 41, timestamp: Date.UTC(2025, 1, 16) },
  { label: "Round 2", contestKey: "r2", rating: 1402, ranking: 18, timestamp: Date.UTC(2025, 3, 6) },
  { label: "Autumn Open", contestKey: "ao", rating: 1361, ranking: 33, timestamp: Date.UTC(2025, 4, 25) },
  { label: "Round 3", contestKey: "r3", rating: 1655, ranking: 9, timestamp: Date.UTC(2025, 6, 13) },
  { label: "Round 4", contestKey: "r4", rating: 1904, ranking: 3, timestamp: Date.UTC(2025, 10, 2) },
  { label: "Round 5", contestKey: "r5", rating: 2248, ranking: 1, timestamp: Date.UTC(2026, 5, 7) },
];

describe("buildRatingChart", () => {
  it("draws a line through every rated contest", () => {
    const chart = buildRatingChart(HISTORY, CHART_WIDTH, CHART_HEIGHT);

    expect(chart.dots).toHaveLength(HISTORY.length);
    expect(chart.line).toMatchInlineSnapshot(
      `"M 48 214.76 L 119.65 191.97 L 191.29 200.09 L 262.94 141.83 L 426.71 92.48 L 744 24.31"`,
    );
  });

  it("scales the domain to the ratings and pads it", () => {
    const chart = buildRatingChart(HISTORY);

    expect(chart.domain).toEqual({ low: 1200, high: 2300 });
    // The first and last points sit on the ends of the plot.
    expect(chart.dots[0]?.x).toBe(chart.plot.x);
    expect(chart.dots[chart.dots.length - 1]?.x).toBe(chart.plot.x + chart.plot.width);
    // A higher rating is drawn further up.
    expect(chart.dots[0]?.y).toBeGreaterThan(chart.dots[chart.dots.length - 1]?.y as number);
    for (const dot of chart.dots) {
      expect(dot.y).toBeGreaterThanOrEqual(chart.plot.y);
      expect(dot.y).toBeLessThanOrEqual(chart.plot.y + chart.plot.height);
    }
  });

  it("reports the rating gained or lost at each contest", () => {
    const chart = buildRatingChart(HISTORY);

    expect(chart.dots.map((dot) => dot.delta)).toEqual([null, 115, -41, 294, 249, 344]);
  });

  it("keeps the bands that the domain covers, clipped to it", () => {
    const chart = buildRatingChart(HISTORY);

    expect(chart.bands.map((band) => band.token)).toEqual([
      "--rating-amateur",
      "--rating-expert",
      "--rating-candidate-master",
      "--rating-master",
    ]);
    const covered = chart.bands.reduce((sum, band) => sum + band.height, 0);
    expect(covered).toBeCloseTo(chart.plot.height, 5);
  });

  it("labels the y axis inside the domain", () => {
    const chart = buildRatingChart(HISTORY);

    expect(chart.yTicks.map((tick) => tick.value)).toEqual([1200, 1400, 1600, 1800, 2000, 2200]);
    for (const tick of chart.yTicks) {
      expect(tick.y).toBeGreaterThanOrEqual(chart.plot.y);
      expect(tick.y).toBeLessThanOrEqual(chart.plot.y + chart.plot.height);
    }
  });

  it("anchors the end date labels inwards", () => {
    const chart = buildRatingChart(HISTORY);

    expect(chart.xTicks.map((tick) => tick.anchor)).toEqual(["start", "middle", "middle", "middle", "end"]);
    expect(chart.xTicks[0]?.value).toBe(HISTORY[0]?.timestamp);
    expect(chart.xTicks[chart.xTicks.length - 1]?.value).toBe(HISTORY[HISTORY.length - 1]?.timestamp);
  });

  it("thins the date labels out on a narrow chart", () => {
    expect(buildRatingChart(HISTORY, 340).xTicks).toHaveLength(2);
  });

  it("gives a single contest a readable window", () => {
    const chart = buildRatingChart(HISTORY.slice(0, 1));

    expect(chart.domain).toEqual({ low: 1150, high: 1400 });
    expect(chart.dots[0]?.x).toBe(chart.plot.x + chart.plot.width / 2);
    expect(chart.xTicks).toHaveLength(1);
  });

  it("still draws bands and an axis with no history", () => {
    const chart = buildRatingChart([]);

    expect(chart.dots).toEqual([]);
    expect(chart.line).toBe("");
    expect(chart.xTicks).toEqual([]);
    expect(chart.domain).toEqual({ low: 800, high: 2400 });
    expect(chart.bands.length).toBeGreaterThan(1);
    expect(chart.yTicks.length).toBeGreaterThan(1);
    // The panel must keep its size so the About tab does not jump.
    expect(chart.height).toBe(CHART_HEIGHT);
    expect(chart.plot.height).toBeGreaterThan(0);
  });
});
