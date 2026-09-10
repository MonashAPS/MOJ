import type { ReactNode } from "react";
import { cn } from "../cn";

export type TabItem = {
  key: string;
  label: ReactNode;
  href?: string;
  icon?: ReactNode;
  onSelect?: () => void;
};

/** DMOJ's `make_tab`: title on the left, tab strip on the right, accent top border
 *  on the active tab. `after` fills DMOJ's `post_tab_spacer` block. */
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
    <div className={cn("tabs", className)}>
      {breadcrumb ? <nav className="breadcrumb">{breadcrumb}</nav> : null}
      <h2>{title}</h2>
      {after}
      <ul>
        {tabs.map((tab) => {
          const isActive = tab.key === active;
          const inner = (
            <>
              {tab.icon ? <span className="tab-icon">{tab.icon}</span> : null}
              {tab.label}
            </>
          );
          return (
            <li key={tab.key} className={cn("tab", isActive && "active")}>
              {isActive || (!tab.href && !tab.onSelect) ? (
                <span aria-current={isActive ? "page" : undefined}>{inner}</span>
              ) : tab.href ? (
                <a href={tab.href}>{inner}</a>
              ) : (
                <button type="button" onClick={tab.onSelect}>
                  {inner}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function TitleRow({
  title,
  breadcrumb,
  action,
  ruler = true,
}: {
  title: ReactNode;
  breadcrumb?: ReactNode;
  action?: ReactNode;
  ruler?: boolean;
}) {
  return (
    <>
      <div className="title-row">
        {breadcrumb ? <nav className="breadcrumb">{breadcrumb}</nav> : null}
        <h2>{title}</h2>
        {action ? <div className="title-line-action">{action}</div> : null}
      </div>
      {ruler ? <hr /> : null}
    </>
  );
}

export function Breadcrumb({ items }: { items: Array<{ label: ReactNode; href?: string }> }) {
  return (
    <>
      {items.map((item, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: breadcrumb items are a fixed ordered list
        <span key={`${index}-${String(item.href ?? item.label)}`}>
          {index > 0 ? <span className="sep"> / </span> : null}
          {item.href ? <a href={item.href}>{item.label}</a> : <span>{item.label}</span>}
        </span>
      ))}
    </>
  );
}
