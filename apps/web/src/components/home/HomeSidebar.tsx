import { api } from "@convex/_generated/api";
import { getServerSession } from "@/auth/session";
import { query, queryAsViewer } from "@/lib/convex-server";
import { ContestsBox, NewProblemsBox, RecentCommentsBox, TopUsersBox } from "./SideBoxes";

const HOUR = 3_600_000;

/**
 * The home and blog sidebars, read on the server so they arrive with the page.
 *
 * Contests, new problems and top users are the same for every visitor, so they
 * render from this read alone and a fresh load is what refreshes them. Only
 * recent comments depends on who is looking, and stays live.
 */
export async function HomeSidebar() {
  const [session, contests, comments, problems, users] = await Promise.all([
    getServerSession().catch(() => null),
    query(api.contests.homeSidebar, { now: Math.floor(Date.now() / HOUR) * HOUR }).catch(() => []),
    queryAsViewer(api.comments.recent, { limit: 10 }).catch(() => []),
    query(api.problems.recent, { limit: 7 }).catch(() => []),
    query(api.rankings.top, { limit: 10 }).catch(() => []),
  ]);

  return (
    <>
      <ContestsBox contests={contests} />
      <RecentCommentsBox initial={comments} serverHadViewer={!!session} />
      <NewProblemsBox problems={problems} />
      <TopUsersBox users={users} viewerUsername={session?.user.name} />
    </>
  );
}
