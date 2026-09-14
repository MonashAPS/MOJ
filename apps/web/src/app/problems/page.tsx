import { api } from "@convex/_generated/api";
import { TitleRow } from "@moj/ui";
import { Edit3, List, Shuffle } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ProblemsView } from "@/components/problems/ProblemsView";
import { queryAsViewer } from "@/lib/convex-server";
import { parseProblemQuery, problemListArgs, type RawSearchParams } from "@/lib/problem-query";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("problems.list");
  return { title: t("title") };
}

export default async function ProblemsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const t = await getTranslations("problems.list");
  const query = parseProblemQuery(await searchParams);

  const [initial, viewerState, options] = await Promise.all([
    queryAsViewer(api.problems.list, problemListArgs(query)),
    queryAsViewer(api.viewer.current, {}).catch(() => null),
    queryAsViewer(api.pages.problems.filterOptions, {}),
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
      <TitleRow title={t("title")} tabs={initial.inContest ? undefined : tabs} active="list" />
      <ProblemsView
        initial={initial}
        initialOptions={options && !options.inContest ? options : null}
        query={query}
        username={profile?.username ?? null}
        randomSeed={Math.floor(Math.random() * 1_000_000)}
      />
    </>
  );
}
