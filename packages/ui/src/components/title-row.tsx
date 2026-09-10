import type { ReactNode } from "react";
import { cn } from "../cn";
import { focusRing } from "../styles";

export type TabItem = {
  key: string;
  label: ReactNode;
  href?: string;
  icon?: ReactNode;
  onSelect?: () => void;
};

/** DMOJ's title row: h1 left, page tabs right, the primary action furthest right,
 *  and a hairline under all of it. Under 700px the tabs take their own scrolling
 *  row and the action goes full width beneath them. */
export function TitleRow({
  title,
  breadcrumb,
  tabs,
  active,
  action,
  ruler = true,
  className,
}: {
  title: ReactNode;
  breadcrumb?: ReactNode;
  tabs?: TabItem[];
  active?: string;
  action?: ReactNode;
  ruler?: boolean;
  className?: string;
}) {
  return (
    <>
      <div className={cn("grid gap-3", className)}>
        {breadcrumb ? <div className="text-sm text-muted-foreground">{breadcrumb}</div> : null}
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3 max-md:flex-col max-md:items-stretch">
          <h1 className="min-w-0 flex-1 text-balance font-display text-h1 font-bold tracking-tight text-foreground">
            {title}
          </h1>
          {tabs && tabs.length > 0 ? <PageTabs tabs={tabs} active={active} /> : null}
          {action ? (
            // A lone primary action goes full width on a phone; a pair of ghost
            // actions stays a row and wraps rather than overflowing.
            <div className="flex shrink-0 flex-wrap items-center gap-2 max-md:w-full max-md:[&>*:only-child]:w-full">
              {action}
            </div>
          ) : null}
        </div>
      </div>
      {ruler ? <hr className="mb-6 mt-3 border-0 border-t border-border" /> : null}
    </>
  );
}

/** DMOJ's `make_tab`, kept: the active tab has a 3px accent rule on its top edge,
 *  a surface fill and no bottom border, so it merges into the rule under the row. */
export function PageTabs({
  tabs,
  active,
  className,
}: {
  tabs: TabItem[];
  active?: string;
  className?: string;
}) {
  return (
    <nav
      aria-label="Sections"
      className={cn(
        "-mb-px flex shrink-0 items-end gap-1 overflow-x-auto max-md:w-full max-md:pb-px",
        className,
      )}
    >
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        const inner = (
          <>
            {tab.icon ? (
              <span className="flex shrink-0 items-center [&_svg]:size-3.5">{tab.icon}</span>
            ) : null}
            <span className="whitespace-nowrap">{tab.label}</span>
          </>
        );
        const classes = cn(
          "inline-flex h-[34px] items-center gap-1.5 rounded-t-md px-3 text-base transition-colors",
          isActive
            ? "border border-b-0 border-border bg-card text-foreground shadow-[inset_0_3px_0_var(--accent)]"
            : "border border-transparent text-subtle hover:bg-accent hover:text-foreground",
          focusRing,
        );
        if (isActive || (!tab.href && !tab.onSelect)) {
          return (
            <span key={tab.key} className={classes} aria-current={isActive ? "page" : undefined}>
              {inner}
            </span>
          );
        }
        return tab.href ? (
          <a key={tab.key} href={tab.href} className={classes}>
            {inner}
          </a>
        ) : (
          <button key={tab.key} type="button" onClick={tab.onSelect} className={classes}>
            {inner}
          </button>
        );
      })}
    </nav>
  );
}

/** The foundation's name: a title row that always carries tabs. */
export function TabBar({
  title,
  tabs,
  active,
  after,
  breadcrumb,
  className,
}: {
  title: ReactNode;
  tabs: TabItem[];
  active?: string;
  after?: ReactNode;
  breadcrumb?: ReactNode;
  className?: string;
}) {
  return (
    <TitleRow
      title={title}
      tabs={tabs}
      active={active}
      action={after}
      breadcrumb={breadcrumb}
      className={className}
      ruler={false}
    />
  );
}
