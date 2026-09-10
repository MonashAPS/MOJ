import {
  BookOpen,
  Building2,
  Clipboard,
  Cpu,
  FileText,
  GraduationCap,
  Key,
  LifeBuoy,
  ListTree,
  Newspaper,
  Palette,
  Scale,
  Send,
  Settings,
  Sliders,
  Tags,
  Trophy,
  Users,
} from "lucide-react";
import type { ComponentType } from "react";

export type AdminSection = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

export type AdminSectionGroup = {
  label: string;
  items: AdminSection[];
};

/** DMOJ's admin index, grouped the way the club uses it. Section 8 of the spec
 *  fixes the list; the rail hides an entry the viewer has no permission for. */
export const ADMIN_SECTIONS: AdminSectionGroup[] = [
  {
    label: "Judging",
    items: [
      { href: "/admin/problems", label: "Problems", icon: BookOpen },
      { href: "/admin/contests", label: "Contests", icon: Trophy },
      { href: "/admin/submissions", label: "Submissions", icon: Send },
      { href: "/admin/scoreboards", label: "Scoreboards", icon: Clipboard },
      { href: "/admin/jobs", label: "Jobs", icon: Sliders },
    ],
  },
  {
    label: "People",
    items: [
      { href: "/admin/users", label: "Users", icon: Users },
      { href: "/admin/organizations", label: "Organizations", icon: Building2 },
      { href: "/admin/classes", label: "Classes", icon: GraduationCap },
      { href: "/admin/tickets", label: "Tickets", icon: LifeBuoy },
    ],
  },
  {
    label: "Machinery",
    items: [
      { href: "/admin/judges", label: "Judges", icon: Cpu },
      { href: "/admin/languages", label: "Languages", icon: FileText },
      { href: "/admin/api-keys", label: "API keys", icon: Key },
    ],
  },
  {
    label: "Site",
    items: [
      { href: "/admin/navigation", label: "Navigation", icon: ListTree },
      { href: "/admin/config", label: "Config", icon: Settings },
      { href: "/admin/config/branding", label: "Branding", icon: Palette },
      { href: "/admin/flatpages", label: "Flat pages", icon: FileText },
      { href: "/admin/blog", label: "Blog", icon: Newspaper },
      { href: "/admin/licenses", label: "Licenses", icon: Scale },
      { href: "/admin/tags", label: "Contest tags", icon: Tags },
    ],
  },
];
