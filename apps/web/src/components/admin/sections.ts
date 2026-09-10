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
  label: string;
  href: string;
  icon: ComponentType<{ className?: string; size?: number | string }>;
};

export type AdminSectionGroup = { label: string; items: AdminSection[] };

/**
 * The rail. The first group is this half of the console; the rest are the
 * sections the other half owns, listed so the rail is whole either way.
 */
export const ADMIN_SECTIONS: AdminSectionGroup[] = [
  {
    label: "Judging",
    items: [
      { key: "problems", label: "Problems", href: "/admin/problems/", icon: ListChecks },
      { key: "contests", label: "Contests", href: "/admin/contests/", icon: Trophy },
      { key: "submissions", label: "Submissions", href: "/admin/submissions/", icon: FlaskConical },
      { key: "scoreboards", label: "Scoreboards", href: "/admin/scoreboards/", icon: Gauge },
      { key: "jobs", label: "Jobs", href: "/admin/jobs/", icon: LayoutList },
    ],
  },
  {
    label: "People",
    items: [
      { key: "users", label: "Users", href: "/admin/users/", icon: Users },
      { key: "organizations", label: "Organisations", href: "/admin/organizations/", icon: Building2 },
      { key: "classes", label: "Classes", href: "/admin/classes/", icon: Boxes },
      { key: "tickets", label: "Tickets", href: "/admin/tickets/", icon: LifeBuoy },
      { key: "apikeys", label: "API keys", href: "/admin/apikeys/", icon: KeyRound },
    ],
  },
  {
    label: "Machines",
    items: [
      { key: "judges", label: "Judges", href: "/admin/judges/", icon: Server },
      { key: "languages", label: "Languages", href: "/admin/languages/", icon: FileText },
    ],
  },
  {
    label: "Site",
    items: [
      { key: "navigation", label: "Navigation", href: "/admin/navigation/", icon: Menu },
      { key: "config", label: "Configuration", href: "/admin/config/", icon: Settings2 },
      { key: "flatpages", label: "Flat pages", href: "/admin/flatpages/", icon: Files },
      { key: "blog", label: "Blog", href: "/admin/blog/", icon: FileText },
      { key: "licenses", label: "Licences", href: "/admin/licenses/", icon: Scale },
      { key: "tags", label: "Tags", href: "/admin/tags/", icon: Tags },
    ],
  },
];

export const ADMIN_SECTION_INDEX = new Map(
  ADMIN_SECTIONS.flatMap((group) => group.items.map((item) => [item.key, item] as const)),
);
