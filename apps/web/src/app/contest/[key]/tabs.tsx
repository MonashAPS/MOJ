import type { ContestDetail } from "@convex/contests";
import type { TabItem } from "@moj/ui";
import { BarChart3, Copy, FileText, Gavel, Info, Pencil, PieChart, Users } from "lucide-react";

/**
 * `contest/contest-tabs.html`, in DMOJ's order: Info, Statistics, Rankings,
 * Participation, MOSS, Edit, Clone — with Submissions added for the contest's
 * own submission list (SPEC section 8's `contest_all_user_submissions`).
 */
export function contestTabs(
  detail: ContestDetail,
  key: string,
  viewerUsername: string | null,
): TabItem[] {
  const tabs: TabItem[] = [
    { key: "detail", label: "Info", href: `/contest/${key}/`, icon: <Info aria-hidden /> },
  ];
  const viewer = detail.viewer;
  const started = detail.timing.started;

  if (detail.timing.ended || viewer.canEdit) {
    tabs.push({
      key: "stats",
      label: "Statistics",
      href: `/contest/${key}/stats/`,
      icon: <PieChart aria-hidden />,
    });
  }

  if (started || viewer.canEdit) {
    if (viewer.canSeeOwnScoreboard) {
      tabs.push({
        key: "ranking",
        label: "Rankings",
        href: `/contest/${key}/ranking/`,
        icon: <BarChart3 aria-hidden />,
      });
      if (viewer.isAuthenticated) {
        tabs.push({
          key: "participation",
          label: "Participation",
          href: `/contest/${key}/participations/`,
          icon: <Users aria-hidden />,
        });
      }
    } else {
      tabs.push({ key: "ranking", label: "Hidden rankings", icon: <BarChart3 aria-hidden /> });
    }
  }

  if (viewerUsername) {
    tabs.push({
      key: "submissions",
      label: "Submissions",
      href: `/contest/${key}/submissions/${viewerUsername}/`,
      icon: <FileText aria-hidden />,
    });
  }

  if (viewer.canEdit) {
    if (viewer.canMoss) {
      tabs.push({ key: "moss", label: "MOSS", href: `/contest/${key}/moss/`, icon: <Gavel aria-hidden /> });
    }
    tabs.push({
      key: "edit",
      label: "Edit",
      href: `/admin/contests/${key}/`,
      icon: <Pencil aria-hidden />,
    });
  }

  if (viewer.canClone) {
    tabs.push({ key: "clone", label: "Clone", href: `/contest/${key}/clone/`, icon: <Copy aria-hidden /> });
  }

  return tabs;
}

/** The pseudo-tab DMOJ puts after the tabs: join, leave, spectate or log in. */
export function joinKindFor(detail: ContestDetail):
  | "join"
  | "spectate"
  | "virtual"
  | "leave"
  | "stopSpectating"
  | "blocked"
  | "login"
  | null {
  const viewer = detail.viewer;
  if (!viewer.isAuthenticated) return detail.timing.started ? "login" : null;
  if (!detail.timing.started && !viewer.isEditor && !viewer.isTester) return null;

  if (detail.timing.ended) {
    if (viewer.inContest) return "leave";
    return viewer.canJoinVirtual ? "virtual" : null;
  }
  if (viewer.inContest) {
    return detail.participation?.virtual === -1 ? "stopSpectating" : "leave";
  }
  if (viewer.canJoinLive) return "join";
  if (viewer.canSpectate) return "spectate";
  return "blocked";
}
