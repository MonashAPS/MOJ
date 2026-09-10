"use client";

import { api } from "@convex/_generated/api";
import type { LanguageStats, PieChart as PieChartData } from "@convex/stats";
import { Panel, Skeleton } from "@moj/ui";
import { useQuery } from "convex/react";
import { Chart } from "./Chart";
import { CATEGORICAL_TOKENS, CHROME_TOKENS, useTokenColors } from "./tokens";

/** `draw_pie_chart` (stats/media-js.html), with the legend to the right. */
function Pie({
  title,
  data,
  colors,
  chrome,
}: {
  title: string;
  data: PieChartData;
  colors: string[];
  chrome: string[];
}) {
  const total = data.datasets[0]?.data.reduce((sum, value) => sum + value, 0) ?? 0;
  const values = data.datasets[0]?.data ?? [];
  const ink = chrome[0] ?? "";

  return (
    <Panel title={title} bodyClassName="grid gap-4 p-4 min-[720px]:grid-cols-[300px_minmax(0,1fr)]">
      <Chart
        type="pie"
        height={260}
        ariaLabel={title}
        labels={data.labels}
        datasets={[
          {
            data: values,
            backgroundColor: data.labels.map((_, index) => colors[index % colors.length] ?? ""),
            borderWidth: 0,
          },
        ]}
        options={{ plugins: { legend: { display: false }, tooltip: { titleColor: ink } } }}
      />
      {/* Colour is never the only signal: the legend carries every label and its share. */}
      <ul className="grid content-start gap-1">
        {data.labels.map((label, index) => (
          <li key={label} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-xs"
              style={{ background: colors[index % colors.length] }}
            />
            <span className="min-w-0 flex-1 truncate text-subtle">{label}</span>
            <span className="font-mono tabular-nums text-muted-foreground">
              {(values[index] ?? 0).toLocaleString("en-AU")}
            </span>
            <span className="w-14 text-right font-mono tabular-nums text-muted-foreground">
              {total > 0 ? `${(((values[index] ?? 0) / total) * 100).toFixed(1)}%` : "—"}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** `draw_bar_chart`: a horizontal bar per language, 0-100%. */
function AcRateChart({ data, chrome }: { data: LanguageStats["acRate"]; chrome: string[] }) {
  const [ink, muted, line] = chrome;
  const values = data.datasets[0]?.data ?? [];
  const height = Math.max(220, 22 * data.labels.length + 40);

  return (
    <Panel title="Language AC rate" bodyClassName="p-4">
      <Chart
        type="bar"
        height={height}
        ariaLabel="AC rate by language"
        labels={data.labels}
        datasets={[
          {
            data: values,
            backgroundColor: chrome[4] ?? "",
            borderWidth: 0,
          },
        ]}
        options={{
          indexAxis: "y",
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (item) => `${Number(item.raw).toFixed(2)}%`,
              },
            },
          },
          scales: {
            x: {
              min: 0,
              max: 100,
              ticks: { color: muted, font: { family: "var(--font-mono)" } },
              grid: { color: line },
              border: { color: line },
            },
            y: {
              ticks: { color: ink, font: { family: "var(--font-body)" } },
              grid: { display: false },
              border: { color: line },
            },
          },
        }}
      />
    </Panel>
  );
}

/** `stats/language.html`: DMOJ's four charts, live off one subscription. */
export function LanguageCharts({ initial }: { initial: LanguageStats }) {
  const live = useQuery(api.stats.language, {});
  const data = live ?? initial;
  const colors = useTokenColors(CATEGORICAL_TOKENS);
  const chrome = useTokenColors([...CHROME_TOKENS, "--brand-royal"]);
  const ready = colors.every((color) => color.length > 0) && chrome.every((color) => color.length > 0);

  if (!ready) {
    return (
      <div className="grid gap-4">
        {[
          "Submission statistics",
          "Submissions by language",
          "AC submissions by language",
          "Language AC rate",
        ].map((title) => (
          <Panel key={title} title={title} bodyClassName="p-4">
            <Skeleton className="h-[260px] w-full" />
          </Panel>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <Pie title="Submission statistics" data={data.statusData} colors={colors} chrome={chrome} />
      <Pie title="Submissions by language" data={data.languageData} colors={colors} chrome={chrome} />
      <Pie title="AC submissions by language" data={data.acLanguageData} colors={colors} chrome={chrome} />
      <AcRateChart data={data.acRate} chrome={chrome} />
    </div>
  );
}
