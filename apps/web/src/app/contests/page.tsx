import { api } from "@convex/_generated/api";
import { Button, TitleRow } from "@moj/ui";
import { CalendarPlus } from "lucide-react";
import type { Metadata } from "next";
import { queryAsViewer } from "@/lib/convex-server";
import { ContestListClient } from "./ContestListClient";
import { type ContestListArgs, PAST_PER_PAGE } from "./shared";
import { contestListTabs } from "./tabs";

export const metadata: Metadata = {
  title: "Contests",
  description: "The MAPS Online Judge's contest list — past, present, and future.",
};

export default async function ContestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const single = (name: string): string | undefined => {
    const value = params[name];
    return Array.isArray(value) ? value[0] : value;
  };

  const page = Math.max(1, Number.parseInt(single("page") ?? "1", 10) || 1);
  const search = single("search") ?? "";
  const tagName = single("tag") ?? "";
  const sort = single("sort") ?? "startTime";
  const descending = single("order") !== "asc";

  // Convex's argument encoder has no room for `undefined`, so an absent filter
  // is an absent key.
  const args: ContestListArgs = {
    paginationOpts: { numItems: PAST_PER_PAGE, cursor: String((page - 1) * PAST_PER_PAGE) },
    sort,
    descending,
    ...(search ? { search } : {}),
    ...(tagName ? { tagName } : {}),
  };

  const [initial, viewerState, permissions] = await Promise.all([
    queryAsViewer(api.contests.list, args).catch(() => null),
    queryAsViewer(api.viewer.current, {}).catch(() => null),
    queryAsViewer(api.viewer.permissions, {
      codes: ["judge.edit_all_contest", "judge.edit_own_contest"],
    }).catch(() => ({}) as Record<string, boolean>),
  ]);

  const canEditContests =
    permissions["judge.edit_all_contest"] === true || permissions["judge.edit_own_contest"] === true;

  const now = new Date();

  return (
    <>
      <TitleRow
        title="Contests"
        tabs={contestListTabs({
          year: now.getFullYear(),
          month: now.getMonth() + 1,
          canEdit: canEditContests,
        })}
        active="list"
        action={
          <Button asChild variant="secondary" size="sm" icon={<CalendarPlus aria-hidden />}>
            <a href="/contests.ics">Subscribe</a>
          </Button>
        }
      />
      <ContestListClient
        args={args}
        initial={initial}
        page={page}
        search={search}
        tagName={tagName}
        sort={sort}
        descending={descending}
        inContest={viewerState?.inContest ?? false}
      />
    </>
  );
}
