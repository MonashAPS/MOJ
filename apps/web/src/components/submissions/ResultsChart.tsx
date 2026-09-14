"use client";

import { api } from "@convex/_generated/api";
import { Panel, Skeleton } from "@moj/ui";
import { useQuery } from "convex/react";
import { PieChart } from "lucide-react";
import { useTranslations } from "next-intl";
import { Chart } from "@/components/charts/Chart";
import { RESULT_TOKENS, useTokenColors } from "@/components/charts/tokens";

export type ResultData = {
  categories: Array<{ code: string; name: string; count: number }>;
  total: number;
};

/**
 * DMOJ's "Statistics" side box: `_get_result_data`'s five categories as a pie
 * with the total underneath. The legend carries the code and the count, so the
 * chart is never colour alone.
 */
export function ResultsChart({ problemCode, initial }: { problemCode?: string; initial: ResultData }) {
  const t = useTranslations("submissions.results");
  const live = useQuery(api.submissions.resultsForProblem, problemCode ? { problemCode } : {});
  const data = live ?? initial;
  const colors = useTokenColors(RESULT_TOKENS);
  const ready = colors.every((color) => color.length > 0);

  return (
    <Panel
      title={t("title")}
      icon={<PieChart aria-hidden className="size-3.5" />}
      bodyClassName="grid gap-3 p-3"
    >
      {ready ? (
        <Chart
          type="pie"
          height={168}
          ariaLabel={t("chartLabel")}
          labels={data.categories.map((category) => category.name)}
          datasets={[
            {
              data: data.categories.map((category) => category.count),
              backgroundColor: colors,
              borderWidth: 0,
            },
          ]}
          options={{ plugins: { legend: { display: false } } }}
        />
      ) : (
        <Skeleton className="mx-auto size-[168px] rounded-full" />
      )}

      <ul className="grid gap-1">
        {data.categories.map((category, index) => (
          <li key={category.code} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-xs"
              style={{ background: colors[index] }}
            />
            <span className="min-w-0 flex-1 truncate text-subtle">{category.name}</span>
            <span className="font-mono tabular-nums text-muted-foreground">
              {category.count.toLocaleString("en-AU")}
            </span>
          </li>
        ))}
      </ul>

      <p className="border-t border-border pt-2 text-center font-mono text-sm tabular-nums text-muted-foreground">
        {t("counted", { count: data.total })}
      </p>
    </Panel>
  );
}
