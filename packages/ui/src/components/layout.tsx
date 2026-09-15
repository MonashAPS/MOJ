import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn";

/** DMOJ's `common-content`: the work column plus a sticky `.info-float` sidebar
 *  that stacks underneath below 700px, sidebar last. */
export function TwoColumn({
  children,
  side,
  className,
  sideClassName,
}: {
  children: ReactNode;
  side?: ReactNode;
  className?: string;
  sideClassName?: string;
}) {
  return (
    <div
      data-slot="two-column"
      className={cn(
        "grid gap-8",
        side ? "grid-cols-1 min-[960px]:grid-cols-[minmax(0,1fr)_var(--sidebar-w)]" : "grid-cols-1",
        className,
      )}
    >
      <div className="min-w-0">{children}</div>
      {side ? (
        <aside className={cn("min-w-0", sideClassName)}>
          <div className="grid gap-4 min-[960px]:sticky min-[960px]:top-(--sticky-top)">{side}</div>
        </aside>
      ) : null}
    </div>
  );
}

/** Statement, blog and comment typography. Pass `html` for sanitised output from
 *  @moj/content, or children for React content. */
export function ContentDescription({
  html,
  children,
  className,
  ...props
}: ComponentProps<"div"> & { html?: string }) {
  if (html !== undefined) {
    return (
      <div
        className={cn("content-description", className)}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitised upstream by @moj/content
        dangerouslySetInnerHTML={{ __html: html }}
        {...props}
      />
    );
  }

  return (
    <div className={cn("content-description", className)} {...props}>
      {children}
    </div>
  );
}
