import type { TabItem } from "@moj/ui";
import { CalendarDays, ListOrdered, Pencil } from "lucide-react";

/** `contest-list-tabs.html`: List, Calendar, and Admin for contest editors. */
export function contestListTabs({
  year,
  month,
  canEdit,
}: {
  year: number;
  month: number;
  canEdit: boolean;
}): TabItem[] {
  const tabs: TabItem[] = [
    { key: "list", label: "List", href: "/contests/", icon: <ListOrdered aria-hidden /> },
    {
      key: "calendar",
      label: "Calendar",
      href: `/contests/${year}/${month}/`,
      icon: <CalendarDays aria-hidden />,
    },
  ];
  if (canEdit) {
    tabs.push({ key: "admin", label: "Admin", href: "/admin/contests/", icon: <Pencil aria-hidden /> });
  }
  return tabs;
}
