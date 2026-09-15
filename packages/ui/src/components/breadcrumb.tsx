import { Slot } from "@radix-ui/react-slot";
import { ChevronRight, MoreHorizontal } from "lucide-react";
import { type ComponentProps, Fragment, type ReactNode } from "react";
import { cn } from "../cn";

export function BreadcrumbRoot({ className, ...props }: ComponentProps<"nav">) {
  return <nav data-slot="breadcrumb" aria-label="Breadcrumb" className={cn(className)} {...props} />;
}

export function BreadcrumbList({ className, ...props }: ComponentProps<"ol">) {
  return (
    <ol
      data-slot="breadcrumb-list"
      className={cn("flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export function BreadcrumbItem({ className, ...props }: ComponentProps<"li">) {
  return (
    <li
      data-slot="breadcrumb-item"
      className={cn("inline-flex items-center gap-1.5", className)}
      {...props}
    />
  );
}

export function BreadcrumbLink({
  className,
  asChild,
  ...props
}: ComponentProps<"a"> & { asChild?: boolean }) {
  const Component = asChild ? Slot : "a";

  return (
    <Component
      data-slot="breadcrumb-link"
      className={cn("text-link transition-colors hover:text-link-hover hover:underline", className)}
      {...props}
    />
  );
}

export function BreadcrumbPage({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      data-slot="breadcrumb-page"
      aria-current="page"
      className={cn("text-subtle", className)}
      {...props}
    />
  );
}

export function BreadcrumbSeparator({ children, className, ...props }: ComponentProps<"li">) {
  return (
    <li
      data-slot="breadcrumb-separator"
      role="presentation"
      aria-hidden
      className={cn("[&>svg]:size-3 text-muted-foreground", className)}
      {...props}
    >
      {children ?? <ChevronRight />}
    </li>
  );
}

export function BreadcrumbEllipsis({ className, ...props }: ComponentProps<"span">) {
  return (
    <span role="presentation" aria-hidden className={cn("flex size-4 items-center", className)} {...props}>
      <MoreHorizontal className="size-3.5" />
      <span className="sr-only">More</span>
    </span>
  );
}

/** The everyday form: a list of crumbs, the last one the current page. */
export function Breadcrumb({
  items,
  className,
  children,
}: {
  items?: Array<{ label: ReactNode; href?: string }>;
  className?: string;
  children?: ReactNode;
}) {
  if (!items) {
    return (
      <BreadcrumbRoot className={className}>
        <BreadcrumbList>{children}</BreadcrumbList>
      </BreadcrumbRoot>
    );
  }

  return (
    <BreadcrumbRoot className={className}>
      <BreadcrumbList>
        {items.map((item, index) => (
          // The separator is a sibling of the crumb, not a child: it renders an
          // `li`, and an `li` inside an `li` is invalid HTML that React reports
          // as a hydration mismatch.
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
    </BreadcrumbRoot>
  );
}
