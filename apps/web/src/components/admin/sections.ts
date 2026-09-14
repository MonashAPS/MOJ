import {
  Boxes,
  Building2,
  Files,
  FileText,
  FlaskConical,
  Gauge,
  KeyRound,
  LayoutList,
  LifeBuoy,
  ListChecks,
  Menu,
  MonitorPlay,
  Scale,
  Server,
  Settings2,
  Tags,
  Trophy,
  Users,
} from "lucide-react";
import type { ComponentType } from "react";

export type AdminSection = {
  key: string;
  href: string;
  icon: ComponentType<{ className?: string; size?: number | string }>;
};

export type AdminSectionGroup = { key: string; items: AdminSection[] };

/**
 * The rail. The first group is this half of the console; the rest are the
 * sections the other half owns, listed so the rail is whole either way.
 *
 * The labels are keys rather than words: this module is plain data, rendered by
 * a client component and by a server one, and neither a hook nor its server
 * counterpart can be reached from here. Both resolve them under
 * `admin.shell.sections`.
 */
export const ADMIN_SECTIONS: AdminSectionGroup[] = [
  {
    key: "judging",
    items: [
      { key: "problems", href: "/admin/problems/", icon: ListChecks },
      { key: "contests", href: "/admin/contests/", icon: Trophy },
      { key: "submissions", href: "/admin/submissions/", icon: FlaskConical },
      { key: "scoreboards", href: "/admin/scoreboards/", icon: Gauge },
      { key: "jobs", href: "/admin/jobs/", icon: LayoutList },
      { key: "proctor", href: "/admin/proctor/", icon: MonitorPlay },
    ],
  },
  {
    key: "people",
    items: [
      { key: "users", href: "/admin/users/", icon: Users },
      { key: "organizations", href: "/admin/organizations/", icon: Building2 },
      { key: "classes", href: "/admin/classes/", icon: Boxes },
      { key: "tickets", href: "/admin/tickets/", icon: LifeBuoy },
      { key: "apikeys", href: "/admin/api-keys/", icon: KeyRound },
    ],
  },
  {
    key: "machines",
    items: [
      { key: "judges", href: "/admin/judges/", icon: Server },
      { key: "languages", href: "/admin/languages/", icon: FileText },
    ],
  },
  {
    key: "site",
    items: [
      { key: "navigation", href: "/admin/navigation/", icon: Menu },
      { key: "config", href: "/admin/config/", icon: Settings2 },
      { key: "flatpages", href: "/admin/flatpages/", icon: Files },
      { key: "blog", href: "/admin/blog/", icon: FileText },
      { key: "licenses", href: "/admin/licenses/", icon: Scale },
      { key: "tags", href: "/admin/tags/", icon: Tags },
    ],
  },
];

export const ADMIN_SECTION_INDEX = new Map(
  ADMIN_SECTIONS.flatMap((group) => group.items.map((item) => [item.key, item] as const)),
);
