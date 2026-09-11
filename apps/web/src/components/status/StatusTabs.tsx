import type { TabItem } from "@moj/ui";
import { Code2, Server, Table2 } from "lucide-react";

/** `status/status-tabs.html`: Judges / Runtimes / Versions, on all three pages. */
export const STATUS_TABS: TabItem[] = [
  { key: "judges", label: "Judges", href: "/status/", icon: <Server aria-hidden /> },
  { key: "runtimes", label: "Runtimes", href: "/runtimes/", icon: <Code2 aria-hidden /> },
  { key: "matrix", label: "Versions", href: "/runtimes/matrix/", icon: <Table2 aria-hidden /> },
];
