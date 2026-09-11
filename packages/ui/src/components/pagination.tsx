import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "../cn";
import { focusRing } from "../styles";
import { buttonVariants } from "./button";

/** DMOJ's digg-style pager: prev, a window of pages with ellipses, next. */
export function paginationRange(page: number, totalPages: number, adjacent = 2): (number | "gap")[] {
  if (totalPages <= 1) return [1];
  const pages: (number | "gap")[] = [];
  const push = (value: number | "gap") => {
    if (value === "gap" && pages[pages.length - 1] === "gap") return;
    pages.push(value);
  };
  for (let index = 1; index <= totalPages; index++) {
    if (index === 1 || index === totalPages || Math.abs(index - page) <= adjacent) push(index);
    else push("gap");
  }
  return pages;
}

export function PaginationRoot({ className, ...props }: ComponentProps<"nav">) {
  return (
    <nav
      data-slot="pagination"
      aria-label="Pagination"
      className={cn("mx-auto flex w-full justify-center", className)}
      {...props}
    />
  );
}

export function PaginationContent({ className, ...props }: ComponentProps<"ul">) {
  return (
    <ul
      data-slot="pagination-content"
      className={cn("flex list-none items-center gap-1", className)}
      {...props}
    />
  );
}

export function PaginationItem(props: ComponentProps<"li">) {
  return <li data-slot="pagination-item" {...props} />;
}

const pageCell =
  "inline-flex h-(--control-h-sm) min-w-(--control-h-sm) items-center justify-center rounded-md px-2 font-mono text-sm tabular-nums transition-colors max-sm:min-h-11 max-sm:min-w-11";

export function PaginationLink({
  className,
  isActive,
  ...props
}: ComponentProps<"a"> & { isActive?: boolean }) {
  return (
    <a
      data-slot="pagination-link"
      aria-current={isActive ? "page" : undefined}
      className={cn(
        pageCell,
        isActive ? "bg-primary text-primary-foreground" : "text-subtle hover:bg-accent hover:text-foreground",
        focusRing,
        className,
      )}
      {...props}
    />
  );
}

export function PaginationPrevious({ className, ...props }: ComponentProps<"a">) {
  return (
    <PaginationLink aria-label="Previous page" rel="prev" className={cn("gap-1 px-2", className)} {...props}>
      <ChevronLeft className="size-3.5" aria-hidden />
      <span className="max-sm:sr-only">Prev</span>
    </PaginationLink>
  );
}

export function PaginationNext({ className, ...props }: ComponentProps<"a">) {
  return (
    <PaginationLink aria-label="Next page" rel="next" className={cn("gap-1 px-2", className)} {...props}>
      <span className="max-sm:sr-only">Next</span>
      <ChevronRight className="size-3.5" aria-hidden />
    </PaginationLink>
  );
}

export function PaginationEllipsis({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      aria-hidden
      data-slot="pagination-ellipsis"
      className={cn(pageCell, "text-muted-foreground", className)}
      {...props}
    >
      <MoreHorizontal className="size-3.5" />
    </span>
  );
}

/** The everyday pager. Compose the parts above only for something unusual. */
export function Pagination({
  page,
  totalPages,
  hrefFor,
  className,
  label = "Pagination",
}: {
  page: number;
  totalPages: number;
  hrefFor: (page: number) => string;
  className?: string;
  label?: string;
}) {
  if (totalPages <= 1) return null;
  const items = paginationRange(page, totalPages);
  return (
    <PaginationRoot aria-label={label} className={className}>
      <PaginationContent>
        <PaginationItem>
          {page <= 1 ? (
            <span className={cn(pageCell, "cursor-not-allowed text-muted-foreground opacity-50")}>
              <ChevronLeft className="size-3.5" aria-hidden />
              <span className="max-sm:sr-only ml-1">Prev</span>
            </span>
          ) : (
            <PaginationPrevious href={hrefFor(page - 1)} />
          )}
        </PaginationItem>
        {items.map((item, index) =>
          item === "gap" ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: gaps have no identity of their own
            <PaginationItem key={`gap-${index}`}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={item}>
              <PaginationLink href={hrefFor(item)} isActive={item === page}>
                {item}
              </PaginationLink>
            </PaginationItem>
          ),
        )}
        <PaginationItem>
          {page >= totalPages ? (
            <span className={cn(pageCell, "cursor-not-allowed text-muted-foreground opacity-50")}>
              <span className="max-sm:sr-only mr-1">Next</span>
              <ChevronRight className="size-3.5" aria-hidden />
            </span>
          ) : (
            <PaginationNext href={hrefFor(page + 1)} />
          )}
        </PaginationItem>
      </PaginationContent>
    </PaginationRoot>
  );
}

export { buttonVariants as paginationButtonVariants };
