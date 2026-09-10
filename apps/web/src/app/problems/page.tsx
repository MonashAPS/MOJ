import { api } from "@convex/_generated/api";
import { TitleRow } from "@moj/ui";
import { Edit3, List, Shuffle } from "lucide-react";
import type { Metadata } from "next";
import { ProblemsView } from "@/components/problems/ProblemsView";
import { queryAsViewer } from "@/lib/convex-server";
import { parseProblemQuery, problemListArgs, type RawSearchParams } from "@/lib/problem-query";

export const metadata: Metadata = { title: "Problems" };
export const dynamic = "force-dynamic";

export default async function ProblemsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const query = parseProblemQuery(await searchParams);

  const [initial, viewerState, options] = await Promise.all([
    queryAsViewer(api.problems.list, problemListArgs(query)),
    queryAsViewer(api.viewer.current, {}).catch(() => null),
    // Deployed alongside the rest of `convex/pages/`; until then the panel falls
    // back to the options the current page can see.
    queryAsViewer(api.pages.problems.filterOptions, {}).catch(() => null),
  ]);

  const profile = viewerState?.profile ?? null;
  const isStaff = !!profile && (profile.isStaff || profile.isSuperuser);

  const tabs = [
    { key: "list", label: "List", href: "/problems/", icon: <List /> },
    { key: "random", label: "Random", href: "/problems/random/", icon: <Shuffle /> },
    ...(isStaff ? [{ key: "admin", label: "Admin", href: "/admin/problems", icon: <Edit3 /> }] : []),
  ];

  return (
    <>
      <TitleRow title="Problems" tabs={initial.inContest ? undefined : tabs} active="list" />
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
