import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn";

/** The window motif: a 28px titlebar carrying a micro-label and an optional
 *  trailing glyph or action, over a framed body. This is the side box, the info
 *  box, the sample case and the batch block — one component, one look. */
export function Panel({
  title,
  icon,
  action,
  children,
  bodyClassName,
  className,
  framed = false,
  ...props
}: ComponentProps<"section"> & {
  title?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  bodyClassName?: string;
  /** 2px frame in --line-strong, for panels that must read as objects. */
  framed?: boolean;
}) {
  return (
    <section
      data-slot="panel"
      className={cn(
        "overflow-hidden rounded-md border bg-card",
        framed ? "border-border-strong" : "border-border",
        className,
      )}
      {...props}
    >
      {title ? (
        <header
          data-slot="panel-titlebar"
          className="flex h-7 shrink-0 items-center gap-2 bg-titlebar px-3 text-titlebar-ink"
        >
          <span className="min-w-0 flex-1 truncate font-sans text-xs font-semibold uppercase tracking-label">
            {title}
          </span>
          {action ? <span className="flex shrink-0 items-center">{action}</span> : null}
          {icon ? <span className="flex shrink-0 items-center text-titlebar-ink-2">{icon}</span> : null}
        </header>
      ) : null}
      <div data-slot="panel-body" className={cn("p-3", bodyClassName)}>
        {children}
      </div>
    </section>
  );
}

/** The foundation's name for a side box. */
export function InfoBox({ title, children, className, ...props }: ComponentProps<typeof Panel>) {
  return (
    <Panel title={title} className={className} {...props}>
      {children}
    </Panel>
  );
}
