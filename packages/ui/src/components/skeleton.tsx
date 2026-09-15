import { cn } from "../cn";
import { Skeleton } from "./misc";

/**
 * Placeholders in the shape of what is coming.
 *
 * A row of bars laid out like the table it precedes says the page is working
 * and roughly what it will be, where a line reading "Loading…" says only the
 * first. It also stops the layout jumping when the data lands, because the
 * space was already claimed.
 */

/**
 * Lines of text. The last is short, because the last line of a paragraph is.
 */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("grid gap-2", className)}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          // biome-ignore lint/suspicious/noArrayIndexKey: the bars have no identity.
          key={index}
          className={cn("h-4", index === lines - 1 ? "w-2/5" : index % 3 === 1 ? "w-11/12" : "w-full")}
        />
      ))}
    </div>
  );
}

/**
 * The shape of a table: a header rule and rows of cells.
 *
 * Cells vary in width on purpose. A grid of identical bars reads as a loading
 * graphic; uneven ones read as a table that has not arrived.
 */
export function SkeletonTable({
  rows = 6,
  columns = 4,
  className,
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) {
  const widths = ["w-2/3", "w-1/2", "w-3/4", "w-2/5", "w-5/6", "w-1/3"];

  return (
    <div className={cn("overflow-hidden rounded-md border border-border", className)}>
      <div className="flex gap-4 border-b border-border bg-secondary px-3 py-2">
        {Array.from({ length: columns }, (_, column) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the bars have no identity.
          <Skeleton key={column} className="h-3.5 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: the bars have no identity.
          key={row}
          className="flex items-center gap-4 border-b border-border px-3 py-2.5 last:border-b-0"
        >
          {Array.from({ length: columns }, (_, column) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the bars have no identity.
            <div key={`${row}-${column}`} className="flex-1">
              <Skeleton className={cn("h-4", widths[(row + column) % widths.length])} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** A panel with a title bar and a few lines inside, for an editor or a form. */
export function SkeletonPanel({ lines = 4, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-md border border-border", className)}>
      <div className="border-b border-border bg-secondary px-3 py-2">
        <Skeleton className="h-3.5 w-40" />
      </div>
      <div className="grid gap-3 p-4">
        <SkeletonText lines={lines} />
      </div>
    </div>
  );
}
