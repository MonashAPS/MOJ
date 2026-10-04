import { api } from "@convex/_generated/api";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { type SearchParams, SubmissionListPage } from "@/components/submissions/SubmissionListPage";
import { contestHref } from "@/lib/contest-context";
import { requireContestProblem } from "@/lib/contest-resource.server";
import { queryAsViewer } from "@/lib/convex-server";

export async function generateMetadata({ params }: { params: Promise<{ code: string; user: string }> }) {
  const t = await getTranslations("problems.detail");
  const { code, user } = await params;

  return { title: t("userSubmissionsFor", { user, code }) };
}

export default async function UserProblemSubmissionsPage({
  params,
  searchParams,
  browsingKey,
}: {
  params: Promise<{ code: string; user: string }>;
  searchParams: Promise<SearchParams>;
  browsingKey?: string;
}) {
  const { code, user } = await params;
  const query = await searchParams;

  if (browsingKey) await requireContestProblem(browsingKey, code);
  const viewer = await queryAsViewer(api.viewer.current, {});

  if (user === "me") {
    const search = new URLSearchParams();

    for (const [name, value] of Object.entries(query)) {
      for (const entry of Array.isArray(value) ? value : value === undefined ? [] : [value])
        search.append(name, entry);
    }

    const suffix = search.size ? `?${search}` : "";

    if (!viewer.profile)
      redirect(
        `/accounts/login/?next=${encodeURIComponent(contestHref(`/problem/${code}/submissions/me/${suffix}`, browsingKey ?? null))}`,
      );
    redirect(
      contestHref(`/problem/${code}/submissions/${viewer.profile.username}/${suffix}`, browsingKey ?? null),
    );
  }

  return (
    <SubmissionListPage
      filters={{ problemCode: code, username: user }}
      showProblem={false}
      tab={viewer.profile?.username === user ? "mine" : "user"}
      bestSubmissionsHref={`/problem/${code}/rank/`}
      searchParams={query}
    />
  );
}
