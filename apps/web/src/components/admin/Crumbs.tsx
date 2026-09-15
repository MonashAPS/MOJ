import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@moj/ui";
import { Fragment, type ReactNode } from "react";

/** The console's breadcrumb. `Breadcrumb`'s own `items` shortcut nests its
 *  separator `<li>` inside the crumb's `<li>`, which React rejects at
 *  hydration, so the parts are composed as siblings here instead. */
export function Crumbs({ items }: { items: Array<{ label: ReactNode; href?: string }> }) {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        {items.map((item, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: crumbs are a fixed ordered list
          <Fragment key={`${index}-${String(item.href ?? "")}`}>
            {index > 0 ? <BreadcrumbSeparator /> : null}
            <BreadcrumbItem>
              {item.href ? (
                <BreadcrumbLink href={item.href}>{item.label}</BreadcrumbLink>
              ) : (
                <BreadcrumbPage>{item.label}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
