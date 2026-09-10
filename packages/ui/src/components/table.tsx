import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn";

export type TableProps = ComponentProps<"table"> & {
  /** Zebra on even rows. On by default: it is DMOJ's skin. */
  striped?: boolean;
  /** Wrap in the framed, horizontally scrolling container. On by default. */
  scrollable?: boolean;
  /** 28px rows for rankings and the staff console. */
  dense?: boolean;
  containerClassName?: string;
};

/** Radius and border on the wrapper, `border-collapse` inside, a tinted header
 *  row, zebra on even rows, and the last row losing its rule. */
export function Table({
  className,
  striped = true,
  scrollable = true,
  dense = false,
  containerClassName,
  ...props
}: TableProps) {
  const table = (
    <table
      data-slot="table"
      data-striped={striped || undefined}
      data-dense={dense || undefined}
      className={cn(
        "w-full border-collapse text-base",
        "[&_tbody_tr:last-child_td]:border-b-0",
        striped && "[&_tbody_tr:nth-child(even)]:bg-zebra",
        className,
      )}
      {...props}
    />
  );
  if (!scrollable) return table;
  return (
    <div
      data-slot="table-container"
      className={cn(
        "overflow-hidden overflow-x-auto rounded-md border border-border bg-card",
        containerClassName,
      )}
    >
      {table}
    </div>
  );
}

export function TableHeader({ className, ...props }: ComponentProps<"thead">) {
  return <thead data-slot="table-header" className={cn(className)} {...props} />;
}

export function TableBody({ className, ...props }: ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" className={cn(className)} {...props} />;
}

export function TableFooter({ className, ...props }: ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn("border-t border-border bg-secondary font-medium", className)}
      {...props}
    />
  );
}

export function TableRow({ className, selected, ...props }: ComponentProps<"tr"> & { selected?: boolean }) {
  return (
    <tr
      data-slot="table-row"
      data-selected={selected || undefined}
      className={cn(
        "transition-colors duration-(--dur-fast) hover:bg-row-hover",
        "data-[selected]:bg-row-selected data-[selected]:shadow-[inset_3px_0_0_var(--brand-royal)]",
        className,
      )}
      {...props}
    />
  );
}

export function TableHead({ className, numeric, ...props }: ComponentProps<"th"> & { numeric?: boolean }) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-8 whitespace-nowrap border-b border-border bg-secondary px-3 text-left align-middle",
        "font-sans text-xs font-semibold uppercase leading-none tracking-label text-subtle",
        numeric && "text-right",
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({ className, numeric, ...props }: ComponentProps<"td"> & { numeric?: boolean }) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "h-(--row-h) border-b border-border px-3 align-middle",
        "group-data-[dense]/table:h-(--row-h-dense)",
        numeric && "whitespace-nowrap text-right font-mono text-mono tabular-nums",
        className,
      )}
      {...props}
    />
  );
}

export function TableCaption({ className, ...props }: ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-3 text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

/** A whole-table empty state that keeps the frame. */
export function EmptyRow({
  colSpan,
  children,
  className,
  ...props
}: ComponentProps<"td"> & { colSpan: number; children?: ReactNode }) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className={cn("px-3 py-10 text-center text-sm text-muted-foreground", className)}
        {...props}
      >
        {children}
      </td>
    </tr>
  );
}
