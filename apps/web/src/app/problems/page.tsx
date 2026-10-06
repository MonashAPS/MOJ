import { api } from "@convex/_generated/api";

import { Edit3, List, Shuffle } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ProblemsView } from "@/components/problems/ProblemsView";
import { TitleRow } from "@/components/shell/PageTabs";
import { queryAsViewer } from "@/lib/convex-server";
import { parseProblemQuery, type RawSearchParams } from "@/lib/problem-query";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("problems.list");

  return { title: t("title") };
}

export default async function ProblemsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const t = await getTranslations("problems.list");
  const query = parseProblemQuery(await searchParams);

  // The two filters the browser cannot answer from the catalog are answered
  // here too, so a shared link to one draws filtered from the first paint.
  const search = query.fullText ? query.search.trim() : "";

  const [initial, viewerState, options, searchIds, solvedByIds] = await Promise.all([
    queryAsViewer(api.problems.catalog, {}),
    queryAsViewer(api.viewer.current, {}).catch(() => null),
    queryAsViewer(api.pages.problems.filterOptions, {}),
    search ? queryAsViewer(api.problems.searchIds, { search }) : null,
    query.solvedBy.length > 0 ? queryAsViewer(api.problems.solvedByIds, { usernames: query.solvedBy }) : null,
  ]);

  const profile = viewerState?.profile ?? null;
  const isStaff = !!profile && (profile.isStaff || profile.isSuperuser);

  const tabs = [
    { key: "list", label: t("tabList"), href: "/problems/", icon: <List /> },
    { key: "random", label: t("tabRandom"), href: "/problems/random/", icon: <Shuffle /> },
    ...(isStaff ? [{ key: "admin", label: t("tabAdmin"), href: "/admin/problems", icon: <Edit3 /> }] : []),
  ];

  return (
    <>
      <TitleRow title={t("title")} tabs={tabs} active="list" />
      <ProblemsView
        initial={initial}
        initialQuery={query}
        seeds={{
          searchIds: searchIds ? { key: search, ids: searchIds } : null,
          solvedByIds: solvedByIds ? { key: query.solvedBy.join("\n"), ids: solvedByIds } : null,
        }}
        initialOptions={options}
        username={profile?.username ?? null}
        randomSeed={Math.floor(Math.random() * 1_000_000)}
      />
    </>
  );
}
