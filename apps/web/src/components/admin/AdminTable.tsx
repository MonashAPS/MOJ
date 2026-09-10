"use client";

import {
  cn,
  EmptyState,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@moj/ui";
import { Inbox } from "lucide-react";
import type { ReactNode } from "react";

export type AdminColumn<Row> = {
  key: string;
  header: ReactNode;
  /** Right-aligned mono, for every number in the console. */
  numeric?: boolean;
  className?: string;
  cell: (row: Row) => ReactNode;
};

/**
 * The console's list table: the section 12 table at `--row-h-dense`, with the
 * toolbar row above it and a skeleton in the list's own shape while the
 * subscription warms up. Part 1 owns the canonical version of this file.
 */
export function AdminTable<Row>({
  columns,
  rows,
  rowKey,
  toolbar,
  loading = false,
  emptyTitle = "Nothing here yet",
  emptyDescription,
  emptyAction,
  footer,
  caption,
}: {
  columns: AdminColumn<Row>[];
  rows: Row[] | null | undefined;
  rowKey: (row: Row) => string;
  toolbar?: ReactNode;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  footer?: ReactNode;
  caption?: ReactNode;
}) {
  const pending = loading || rows === null || rows === undefined;

  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-3">
      {toolbar ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 [&_[data-slot=select-trigger]]:h-(--control-h-sm)">
          {toolbar}
        </div>
      ) : null}

      {pending ? (
        <TableSkeleton columns={columns.length} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Inbox aria-hidden />}
          title={emptyTitle}
          description={emptyDescription}
          action={emptyAction}
        />
      ) : (
        <Table dense>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead key={column.key} numeric={column.numeric} className={column.className}>
                  {column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={rowKey(row)}>
                {columns.map((column) => (
                  <TableCell key={column.key} numeric={column.numeric} className={column.className}>
                    {column.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {caption ? <p className="shrink-0 text-sm text-muted-foreground">{caption}</p> : null}
      {footer ? <div className="flex shrink-0 items-center justify-between gap-3">{footer}</div> : null}
    </div>
  );
}

/** Stable keys for placeholders that have no identity of their own. */
function cells(count: number, prefix: string): string[] {
  return Array.from({ length: count }, (_, index) => `${prefix}-${index}`);
}

function TableSkeleton({ columns, rows = 8 }: { columns: number; rows?: number }) {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-card" aria-busy>
      <div className="flex h-8 items-center gap-4 bg-titlebar px-3">
        {cells(columns, "head").map((cell) => (
          <Skeleton key={cell} className="h-2.5 w-16 bg-titlebar-ink/25" />
        ))}
      </div>
      {cells(rows, "row").map((row, rowIndex) => (
        <div
          key={row}
          className={cn(
            "flex h-(--row-h-dense) items-center gap-4 border-b border-border px-3 last:border-b-0",
            rowIndex % 2 === 1 && "bg-zebra",
          )}
        >
          {cells(columns, row).map((cell) => (
            <Skeleton key={cell} className="h-2.5 w-24" />
          ))}
        </div>
      ))}
    </div>
  );
}
