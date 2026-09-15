"use client";

import { Breadcrumb, cn, PageTabs, type TabItem } from "@moj/ui";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

type AdminBreadcrumbItem = { label: string; href?: string };

/**
 * Every console page's header: breadcrumb, title, page tabs and the one primary
 * action. Denser than `TitleRow` on purpose (SPEC section 8, DESIGN 19.2); the
 * rail and the search live in the layout, so a page only writes this.
 *
 * The tab strip takes a row of its own rather than sharing one with the title.
 * An editor's title is a problem or a contest name and its strip is eight tabs
 * wide, so sharing left the name cut to a few characters; the title now wraps
 * as text and the strip scrolls inside itself when it runs out of room.
 */
export function AdminShell({
  title,
  breadcrumb,
  description,
  tabs,
  activeTab,
  action,
  children,
  className,
}: {
  title: ReactNode;
  breadcrumb?: AdminBreadcrumbItem[];
  description?: ReactNode;
  tabs?: TabItem[];
  activeTab?: string;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  // Only the body moves. The rail, the breadcrumb, the title and the tab strip
  // are usually the same on the other side of a navigation, and animating
  // something that did not change reads as the page lurching rather than as it
  // arriving. The search is in the key so switching tabs animates the panel.
  const pathname = usePathname() ?? "";
  const search = useSearchParams()?.toString() ?? "";
  const hasTabs = tabs !== undefined && tabs.length > 0;

  return (
    <div className={cn("flex min-h-0 min-w-0 flex-col", className)}>
      <div className="shrink-0">
        {breadcrumb && breadcrumb.length > 0 ? (
          <div className="mb-2 text-sm text-muted-foreground">
            <Breadcrumb items={breadcrumb} />
          </div>
        ) : null}
        {/* The title keeps a floor width so the action wraps under it rather
            than squeezing the name into a column of letters. */}
        <div className="flex min-w-0 flex-wrap items-end gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1 sm:min-w-64">
            <h1 className="text-balance break-words font-display text-h2 font-bold tracking-tight text-foreground">
              {title}
            </h1>
            {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
          </div>
          {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
        </div>
        {hasTabs ? <PageTabs tabs={tabs} active={activeTab} className="mt-3" /> : null}
        {/* The strip sits on the rule rather than above it: the active tab has
            no bottom border, so the two draw one shape. */}
        <hr className={cn("page-rule mb-4", hasTabs ? "mt-0" : "mt-2")} />
      </div>
      <div key={`${pathname}?${search}`} className="enter-rise min-h-0 min-w-0 flex-1">
        {children}
      </div>
    </div>
  );
}
