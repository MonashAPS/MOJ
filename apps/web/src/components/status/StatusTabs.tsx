import type { TabItem } from "@moj/ui";
import { Code2, Server, Table2 } from "lucide-react";
import { getTranslations } from "next-intl/server";

/** `status/status-tabs.html`: Judges / Runtimes / Versions, on all three pages. */
export async function statusTabs(): Promise<TabItem[]> {
  const t = await getTranslations("status.tabs");

  return [
    { key: "judges", label: t("judges"), href: "/status/", icon: <Server aria-hidden /> },
    { key: "runtimes", label: t("runtimes"), href: "/runtimes/", icon: <Code2 aria-hidden /> },
    { key: "matrix", label: t("matrix"), href: "/runtimes/matrix/", icon: <Table2 aria-hidden /> },
  ];
}
