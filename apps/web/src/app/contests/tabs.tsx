import type { TabItem } from "@moj/ui";
import { CalendarDays, ListOrdered, Pencil } from "lucide-react";

/** The tab labels, from `contests.tabs`. The caller hands them over because the
 *  contest list is an async page, where `getTranslations` is the only reader. */
export type TabLabels = (key: string) => string;

/** `contest-list-tabs.html`: List, Calendar, and Admin for contest editors. */
export function contestListTabs({
  year,
  month,
  canEdit,
  t,
}: {
  year: number;
  month: number;
  canEdit: boolean;
  t: TabLabels;
}): TabItem[] {
  const tabs: TabItem[] = [
    { key: "list", label: t("list"), href: "/contests/", icon: <ListOrdered aria-hidden /> },
    {
      key: "calendar",
      label: t("calendar"),
      href: `/contests/${year}/${month}/`,
      icon: <CalendarDays aria-hidden />,
    },
  ];
  if (canEdit) {
    tabs.push({ key: "admin", label: t("admin"), href: "/admin/contests/", icon: <Pencil aria-hidden /> });
  }
  return tabs;
}
