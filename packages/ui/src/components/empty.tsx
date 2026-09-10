import type { ComponentProps } from "react";
import { cn } from "../cn";

/** A dashed frame, a 40px media slot, a display-face title and one sentence that
 *  says what would fill the space. At most one action. */
export function Empty({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="empty"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border-strong",
        "bg-ground px-6 py-12 text-center",
        className,
      )}
      {...props}
    />
  );
}

export function EmptyMedia({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-media"
      className={cn(
        "flex size-10 items-center justify-center rounded-md bg-secondary text-subtle [&_svg]:size-5",
        className,
      )}
      {...props}
    />
  );
}

export function EmptyTitle({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      data-slot="empty-title"
      className={cn("font-display text-h3 font-semibold text-foreground", className)}
      {...props}
    />
  );
}

export function EmptyDescription({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      data-slot="empty-description"
      className={cn("max-w-[46ch] text-balance text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export function EmptyContent({ className, ...props }: ComponentProps<"div">) {
  return (
    <div data-slot="empty-content" className={cn("mt-1 flex items-center gap-2", className)} {...props} />
  );
}

/** The everyday form. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <Empty className={className}>
      {icon ? <EmptyMedia>{icon}</EmptyMedia> : null}
      <EmptyTitle>{title}</EmptyTitle>
      {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}
