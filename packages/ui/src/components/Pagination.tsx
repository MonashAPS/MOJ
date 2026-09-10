import { cn } from "../cn";

/** DMOJ's digg-style pager: first/prev, a window of pages with ellipses, next/last. */
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
    <nav aria-label={label}>
      <ul className={cn("pagination", className)}>
        <li className={page <= 1 ? "disabled-page" : undefined}>
          {page <= 1 ? (
            <span>&laquo;</span>
          ) : (
            <a href={hrefFor(page - 1)} rel="prev">
              &laquo;
            </a>
          )}
        </li>
        {items.map((item, index) =>
          item === "gap" ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: gaps have no identity of their own
            <li key={`gap-${index}`} className="disabled-page">
              <span>&hellip;</span>
            </li>
          ) : (
            <li key={item} className={item === page ? "active-page" : undefined}>
              {item === page ? <span aria-current="page">{item}</span> : <a href={hrefFor(item)}>{item}</a>}
            </li>
          ),
        )}
        <li className={page >= totalPages ? "disabled-page" : undefined}>
          {page >= totalPages ? (
            <span>&raquo;</span>
          ) : (
            <a href={hrefFor(page + 1)} rel="next">
              &raquo;
            </a>
          )}
        </li>
      </ul>
    </nav>
  );
}
