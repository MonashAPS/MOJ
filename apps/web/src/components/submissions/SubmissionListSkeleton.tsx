import { Skeleton } from "@moj/ui";

/** A list whose shape is known loads as a skeleton in that shape: rows at
 *  `--row-h-2` with bars at the real column widths, never a centred spinner. */
export function SubmissionListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div
      role="status"
      aria-label="Loading submissions"
      className="overflow-hidden rounded-md border border-border bg-card"
    >
      {Array.from({ length: rows }, (_, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: placeholder rows have no identity
          key={index}
          className="flex min-h-(--row-h-2) items-stretch border-b border-border last:border-b-0"
        >
          <span aria-hidden className="w-[3px] shrink-0 bg-secondary" />
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 px-3 py-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-44 max-w-[40%]" />
              <Skeleton className="ml-auto h-[18px] w-10 rounded-xs" />
              <Skeleton className="h-3 w-12" />
            </div>
            <Skeleton className="h-3 w-52 max-w-[60%]" />
          </div>
          <div className="flex shrink-0 flex-col items-end justify-center gap-1.5 px-3 py-2">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}
