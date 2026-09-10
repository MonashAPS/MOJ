import { api } from "@convex/_generated/api";
import { type TabItem, TitleRow } from "@moj/ui";
import { Code2 } from "lucide-react";
import { LanguageCharts } from "@/components/charts/LanguageCharts";
import { queryAsViewer } from "@/lib/convex-server";
import { absoluteTime, plural } from "@/lib/submissionFormat";

export const metadata = { title: "Language statistics" };
export const dynamic = "force-dynamic";

/** `stats/tabs.html`. DMOJ has one tab here; it is kept so the row reads the same. */
const TABS: TabItem[] = [{ key: "language", label: "Language", icon: <Code2 aria-hidden /> }];

export default async function LanguageStatsPage() {
  const initial = await queryAsViewer(api.stats.language, {});

  return (
    <>
      <TitleRow title="Statistics" tabs={TABS} active="language" />
      <div id="content-body" className="grid gap-4">
        <LanguageCharts initial={initial} />
        <p className="text-center text-sm text-muted-foreground">
          Counted from the most recent{" "}
          <span className="font-mono tabular-nums">{plural(initial.scanned, "submission")}</span>
          {initial.truncated ? " (the tally is capped)" : ""}, last updated{" "}
          <time dateTime={new Date(initial.computedAt).toISOString()} className="font-mono tabular-nums">
            {absoluteTime(initial.computedAt)}
          </time>
          .
        </p>
      </div>
    </>
  );
}
