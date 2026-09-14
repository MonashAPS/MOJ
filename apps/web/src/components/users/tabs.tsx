import type { TabItem } from "@moj/ui";
import { Building2, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";

/** `user/user-list-tabs.html`: the leaderboard and the organisation list share
 *  one tab bar. */
export async function userListTabs(): Promise<TabItem[]> {
  const t = await getTranslations("users.tabs");
  return [
    { key: "list", label: t("leaderboard"), href: "/users/", icon: <Users aria-hidden /> },
    {
      key: "organizations",
      label: t("organizations"),
      href: "/organizations/",
      icon: <Building2 aria-hidden />,
    },
  ];
}
