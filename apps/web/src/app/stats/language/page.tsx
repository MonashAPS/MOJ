import { api } from "@convex/_generated/api";
import { type TabItem, TitleRow } from "@moj/ui";
import { Code2 } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { LanguageCharts } from "@/components/charts/LanguageCharts";
import { queryAsViewer } from "@/lib/convex-server";
import { absoluteTime } from "@/lib/submissionFormat";

export async function generateMetadata() {
  const t = await getTranslations("status.languageStats");

  return { title: t("metaTitle") };
}

export const dynamic = "force-dynamic";

export default async function LanguageStatsPage() {
  const t = await getTranslations("status.languageStats");
  const initial = await queryAsViewer(api.stats.language, {});

  /** `stats/tabs.html`. DMOJ has one tab here; it is kept so the row reads the same. */
  const tabs: TabItem[] = [{ key: "language", label: t("tab"), icon: <Code2 aria-hidden /> }];

  return (
    <>
      <TitleRow title={t("title")} tabs={tabs} active="language" />
      <div id="content-body" className="grid gap-4">
        <LanguageCharts initial={initial} />
        <p className="text-center text-sm text-muted-foreground">
          {t.rich(initial.truncated ? "countedCapped" : "counted", {
            scanned: initial.scanned,
            updated: absoluteTime(initial.computedAt),
            count: (chunks) => <span className="font-mono tabular-nums">{chunks}</span>,
            when: (chunks) => (
              <time dateTime={new Date(initial.computedAt).toISOString()} className="font-mono tabular-nums">
                {chunks}
              </time>
            ),
          })}
        </p>
      </div>
    </>
  );
}
