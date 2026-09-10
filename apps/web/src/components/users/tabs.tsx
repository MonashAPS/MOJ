import type { TabItem } from "@moj/ui";
import { Building2, Users } from "lucide-react";

/** `user/user-list-tabs.html`: the leaderboard and the organisation list share
 *  one tab bar. */
export const USER_LIST_TABS: TabItem[] = [
  { key: "list", label: "Leaderboard", href: "/users/", icon: <Users aria-hidden /> },
  { key: "organizations", label: "Organizations", href: "/organizations/", icon: <Building2 aria-hidden /> },
];
