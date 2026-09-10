"use client";

import { api } from "@convex/_generated/api";
import { Pagination } from "@moj/ui";
import { useQuery } from "convex/react";
import { pageHref, type UserSortState } from "@/components/users/leaderboard";
import {
  type LeaderboardRow,
  LeaderboardTable,
  type OrganizationChip,
} from "@/components/users/LeaderboardTable";

/** The leaderboard's live half: the server rendered the first page, and this
 *  keeps it current as points move. */
export function UsersLive({
  initial,
  args,
  state,
  params,
  viewerUsername,
  organizations,
}: {
  initial: { users: LeaderboardRow[]; page: number; totalPages: number; totalUsers: number };
  args: {
    page: number;
    sort: "points" | "problemCount" | "rating" | "performancePoints";
    descending: boolean;
    organizationSlug?: string;
  };
  state: UserSortState;
  params: string;
  viewerUsername: string | null;
  organizations: Record<string, OrganizationChip[]>;
}) {
  const live = useQuery(api.rankings.users, args);
  const data = live ?? initial;
  const search = new URLSearchParams(params);

  return (
    <>
      <LeaderboardTable
        rows={data.users}
        state={state}
        basePath="/users/"
        params={params}
        viewerUsername={viewerUsername}
        organizations={organizations}
        emptyMessage="No users are on the leaderboard yet."
      />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-sm tabular-nums text-muted-foreground">
          {data.totalUsers === 1 ? "1 user" : `${data.totalUsers.toLocaleString("en-AU")} users`}
        </p>
        <Pagination
          page={data.page}
          totalPages={data.totalPages}
          hrefFor={(page) => pageHref("/users/", search, page)}
        />
      </div>
    </>
  );
}
