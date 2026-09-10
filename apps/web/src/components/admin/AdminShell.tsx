"use client";

import { Breadcrumb, cn, PageTabs, type TabItem } from "@moj/ui";
import type { ReactNode } from "react";

export type AdminBreadcrumbItem = { label: string; href?: string };

/**
 * Every console page's header: breadcrumb, title, page tabs and the one primary
 * action. Denser than `TitleRow` on purpose (SPEC section 8, DESIGN 19.2); the
 * rail and the search live in the layout, so a page only writes this.
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
  return (
    <div className={cn("flex min-h-0 min-w-0 flex-col", className)}>
      <div className="shrink-0">
        {breadcrumb && breadcrumb.length > 0 ? (
          <div className="mb-2 text-sm text-muted-foreground">
            <Breadcrumb items={breadcrumb} />
          </div>
        ) : null}
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-h2 font-bold tracking-tight text-foreground">
              {title}
            </h1>
            {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
          </div>
          {tabs && tabs.length > 0 ? <PageTabs tabs={tabs} active={activeTab} /> : null}
          {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
        </div>
        <hr className="mb-4 mt-2 border-0 border-t border-border" />
      </div>
      <div className="min-h-0 min-w-0 flex-1">{children}</div>
    </div>
  );
}
