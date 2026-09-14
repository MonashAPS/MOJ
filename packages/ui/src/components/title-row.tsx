import type { ComponentType, ReactNode } from "react";
import { cn } from "../cn";
import { focusRing } from "../styles";

export type TabItem = {
  key: string;
  label: ReactNode;
  href?: string;
  icon?: ReactNode;
  onSelect?: () => void;
};

/** The element a tab's `href` renders as. Defaults to a plain anchor; a page in
 *  an app router passes its own `Link` so switching tabs is a client navigation
 *  and the shell's route progress and page-enter reveal both run. */
export type TabLink = ComponentType<{
  href: string;
  className?: string;
  children?: ReactNode;
}>;

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
  linkAs,
}: {
  title: ReactNode;
  breadcrumb?: ReactNode;
  tabs?: TabItem[];
  active?: string;
  action?: ReactNode;
  ruler?: boolean;
  className?: string;
  linkAs?: TabLink;
}) {
  return (
    <>
      <div className={cn("grid min-w-0 grid-cols-1 gap-3", className)}>
        {breadcrumb ? <div className="text-sm text-muted-foreground">{breadcrumb}</div> : null}
        {/* `min-w-0`: without it this row's grid track takes the tab strip's
            max-content width and the page scrolls sideways on a phone. */}
        <div className="flex min-w-0 flex-wrap items-end gap-x-4 gap-y-3 max-md:flex-col max-md:items-stretch">
          {/* The title keeps a readable width rather than shrinking to fit: when the
              tabs no longer fit beside it they wrap to their own row, which is what a
              staff view of a problem does with its eight tabs. */}
          <h1 className="min-w-0 flex-1 text-balance font-display text-h1 font-bold tracking-tight text-foreground md:min-w-64">
            {title}
          </h1>
          {tabs && tabs.length > 0 ? <PageTabs tabs={tabs} active={active} linkAs={linkAs} /> : null}
          {action ? (
            // A lone primary action goes full width on a phone; a pair of ghost
            // actions stays a row and wraps rather than overflowing.
            <div className="flex shrink-0 flex-wrap items-center gap-2 max-md:w-full max-md:[&>*:only-child]:w-full">
              {action}
            </div>
          ) : null}
        </div>
      </div>
      {ruler ? <hr className="page-rule mb-6 mt-3" /> : null}
    </>
  );
}

/** DMOJ's `make_tab`, kept: the active tab has a 3px accent rule on its top edge,
 *  a surface fill and no bottom border, so it merges into the rule under the row. */
export function PageTabs({
  tabs,
  active,
  className,
  linkAs: Link = "a" as unknown as TabLink,
  // A landmark label, so it is a prop rather than read from context: this
  // component renders on the server, where context is not available.
  sectionsLabel = "Sections",
}: {
  tabs: TabItem[];
  active?: string;
  className?: string;
  linkAs?: TabLink;
  sectionsLabel?: string;
}) {
  return (
    <nav
      aria-label={sectionsLabel}
      className={cn(
        // `min-w-0` so a long tab strip scrolls inside itself instead of
        // widening the page: a grid or flex child is min-content wide by default.
        "-mb-px flex min-w-0 max-w-full shrink-0 items-end gap-1 overflow-x-auto max-md:w-full max-md:pb-px",
        // Wrapped onto its own row it takes the full width and reads left to right,
        // the way a tab bar under a title does.
        "[&:not(:first-child)]:grow",
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
          <Link key={tab.key} href={tab.href} className={classes}>
            {inner}
          </Link>
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
  linkAs,
}: {
  title: ReactNode;
  tabs: TabItem[];
  active?: string;
  after?: ReactNode;
  breadcrumb?: ReactNode;
  className?: string;
  linkAs?: TabLink;
}) {
  return (
    <TitleRow
      title={title}
      tabs={tabs}
      active={active}
      action={after}
      breadcrumb={breadcrumb}
      className={className}
      linkAs={linkAs}
      ruler={false}
    />
  );
}
