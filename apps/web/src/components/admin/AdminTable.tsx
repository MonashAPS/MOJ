"use client";

import {
  Button,
  Checkbox,
  cn,
  EmptyState,
  Pagination,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@moj/ui";
import { Inbox } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export type AdminColumn<Row> = {
  key: string;
  header: ReactNode;
  /** Mono, tabular and right-aligned. */
  numeric?: boolean;
  cell: (row: Row) => ReactNode;
  className?: string;
  headClassName?: string;
};

export type AdminBulkAction = {
  label: string;
  onSelect: () => void;
  destructive?: boolean;
};

/**
 * The section-12 table with the console's toolbar and, when a section offers
 * one, bulk selection: a 32px checkbox column and a sticky action bar at the
 * bottom of the wrapper rather than a floating toolbar (DESIGN 19.2).
 */
export function AdminTable<Row>({
  columns,
  rows,
  rowKey,
  href,
  loading = false,
  skeletonRows = 8,
  empty,
  selection,
  bulkActions,
  toolbar,
  footer,
  caption,
  className,
}: {
  columns: AdminColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  href?: (row: Row) => string;
  loading?: boolean;
  skeletonRows?: number;
  empty?: { title: string; description?: string; action?: ReactNode };
  selection?: { selected: string[]; onChange: (next: string[]) => void };
  bulkActions?: AdminBulkAction[];
  toolbar?: ReactNode;
  footer?: ReactNode;
  caption?: string;
  className?: string;
}) {
  const selectable = !!selection;
  const selectedSet = new Set(selection?.selected ?? []);
  const allKeys = rows.map(rowKey);
  const allSelected = allKeys.length > 0 && allKeys.every((key) => selectedSet.has(key));
  const someSelected = allKeys.some((key) => selectedSet.has(key));
  const span = columns.length + (selectable ? 1 : 0);

  return (
    <div className={cn("flex min-h-0 min-w-0 flex-col gap-3", className)}>
      {toolbar ? <div className="shrink-0">{toolbar}</div> : null}

      <div className="min-h-0 min-w-0">
        <Table dense className="group/table" containerClassName="relative">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <TableHeader>
            <TableRow>
              {selectable ? (
                <TableHead className="w-8 px-2">
                  <Checkbox
                    id="admin-table-select-all"
                    aria-label="Select every row on this page"
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    onCheckedChange={(checked) =>
                      selection?.onChange(checked ? allKeys : [])
                    }
                  />
                </TableHead>
              ) : null}
              {columns.map((column) => (
                <TableHead key={column.key} numeric={column.numeric} className={column.headClassName}>
                  {column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading
              ? Array.from({ length: skeletonRows }, (_unused, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: placeholder rows have no identity
                  <TableRow key={`skeleton-${index}`}>
                    {selectable ? (
                      <TableCell className="px-2">
                        <Skeleton className="size-4" />
                      </TableCell>
                    ) : null}
                    {columns.map((column) => (
                      <TableCell key={column.key} numeric={column.numeric}>
                        <Skeleton className={cn("h-3", column.numeric ? "ml-auto w-10" : "w-32")} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : rows.map((row) => {
                  const key = rowKey(row);
                  const target = href?.(row);
                  return (
                    <TableRow key={key} selected={selectedSet.has(key)}>
                      {selectable ? (
                        <TableCell className="px-2">
                          <Checkbox
                            id={`admin-table-select-${key}`}
                            aria-label={`Select ${key}`}
                            checked={selectedSet.has(key)}
                            onCheckedChange={(checked) => {
                              const next = new Set(selectedSet);
                              if (checked) next.add(key);
                              else next.delete(key);
                              selection?.onChange([...next]);
                            }}
                          />
                        </TableCell>
                      ) : null}
                      {columns.map((column, index) => (
                        <TableCell
                          key={column.key}
                          numeric={column.numeric}
                          className={cn(index === 0 && target && "relative", column.className)}
                        >
                          {index === 0 && target ? (
                            <Link
                              href={target}
                              className="rounded-xs after:absolute after:inset-0 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-royal/45"
                            >
                              {column.cell(row)}
                            </Link>
                          ) : (
                            column.cell(row)
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
            {!loading && rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={span} className="h-auto p-0">
                  <EmptyState
                    className="rounded-none border-0"
                    icon={<Inbox aria-hidden />}
                    title={empty?.title ?? "Nothing here"}
                    description={empty?.description}
                    action={empty?.action}
                  />
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>

        {selectable && selection.selected.length > 0 && bulkActions && bulkActions.length > 0 ? (
          <div className="sticky bottom-0 z-(--z-sticky) mt-px flex flex-wrap items-center gap-2 rounded-b-md border border-t-0 border-border bg-secondary px-3 py-2">
            <span className="font-mono text-sm tabular-nums text-subtle">
              {selection.selected.length} selected
            </span>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {bulkActions.map((action) => (
                <Button
                  key={action.label}
                  size="sm"
                  variant={action.destructive ? "danger" : "secondary"}
                  onClick={action.onSelect}
                >
                  {action.label}
                </Button>
              ))}
              <Button size="sm" variant="ghost" onClick={() => selection.onChange([])}>
                Clear
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {footer ? <div className="shrink-0">{footer}</div> : null}
    </div>
  );
}

/** The toolbar row every list carries: search, filters, then the primary action. */
export function AdminToolbar({
  children,
  action,
  className,
}: {
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {children}
      {action ? <div className="ml-auto flex items-center gap-2">{action}</div> : null}
    </div>
  );
}

/** "1 to 50 of 812" plus the page window, on one line under a list. */
export function AdminPager({
  page,
  pageSize,
  total,
  hrefFor,
  noun = "row",
  pluralNoun,
}: {
  page: number;
  pageSize: number;
  total: number;
  hrefFor: (page: number) => string;
  noun?: string;
  pluralNoun?: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  const plural = pluralNoun ?? `${noun}s`;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="font-mono text-sm tabular-nums text-muted-foreground">
        {total === 0
          ? `No ${plural}`
          : `${first} to ${last} of ${total} ${total === 1 ? noun : plural}`}
      </span>
      <div className="ml-auto">
        <Pagination page={page} totalPages={totalPages} hrefFor={hrefFor} />
      </div>
    </div>
  );
}
