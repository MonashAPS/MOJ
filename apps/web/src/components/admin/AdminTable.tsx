"use client";

import {
  Button,
  Checkbox,
  cn,
  EmptyState,
  Field,
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
import { useTranslations } from "next-intl";
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

type AdminBulkAction = {
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
  emptyTitle,
  emptyDescription,
  emptyAction,
  selection,
  selectAllLabel = "Select every row on this page",
  bulkActions,
  toolbar,
  footer,
  caption,
  className,
}: {
  columns: AdminColumn<Row>[];
  /** Nullish while the subscription warms up, which is the loading state. */
  rows: Row[] | undefined | null;
  rowKey: (row: Row) => string;
  href?: (row: Row) => string;
  loading?: boolean;
  skeletonRows?: number;
  empty?: { title: string; description?: string; action?: ReactNode };
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  selection?: { selected: string[]; onChange: (next: string[]) => void };
  /** The one piece of text the table names itself. It is a prop carrying the
   *  English rather than something read from context, so a caller rendering
   *  outside the message provider still gets a labelled checkbox, the same
   *  reason `PageTabs` and `Pagination` take theirs. */
  selectAllLabel?: string;
  bulkActions?: AdminBulkAction[];
  toolbar?: ReactNode;
  footer?: ReactNode;
  caption?: string;
  className?: string;
}) {
  const t = useTranslations("admin.components.table");
  const selectable = !!selection;
  const data = rows ?? [];
  const pending = loading || rows == null;
  const selectedSet = new Set(selection?.selected ?? []);
  const allKeys = data.map(rowKey);
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
                    aria-label={selectAllLabel}
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    onCheckedChange={(checked) => selection?.onChange(checked ? allKeys : [])}
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
          {/* Rows fade in over the placeholders they replace rather than
              cutting, which is the difference between a table that loaded and
              one that flickered. */}
          <TableBody className={pending ? undefined : "enter-fade"}>
            {pending
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
              : data.map((row) => {
                  const key = rowKey(row);
                  const target = href?.(row);

                  return (
                    <TableRow key={key} selected={selectedSet.has(key)}>
                      {selectable ? (
                        <TableCell className="px-2">
                          <Checkbox
                            id={`admin-table-select-${key}`}
                            aria-label={t("selectRow", { key })}
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
            {!pending && data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={span} className="h-auto p-0">
                  <EmptyState
                    className="m-3"
                    icon={<Inbox aria-hidden />}
                    title={empty?.title ?? emptyTitle ?? t("empty")}
                    description={empty?.description ?? emptyDescription}
                    action={empty?.action ?? emptyAction}
                  />
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>

        {selectable && selection.selected.length > 0 && bulkActions && bulkActions.length > 0 ? (
          <div className="sticky bottom-0 z-(--z-sticky) mt-px flex flex-wrap items-center gap-2 rounded-b-md border border-t-0 border-border bg-secondary px-3 py-2">
            <span className="font-mono text-sm tabular-nums text-subtle">
              {t("selected", { count: selection.selected.length })}
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
                {t("clearSelection")}
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {footer ? <div className="shrink-0">{footer}</div> : null}
    </div>
  );
}

/**
 * The toolbar row every list carries: the filters, then the count and the
 * primary action pinned to the right.
 *
 * The filters are `AdminFilter` cells rather than bare controls, so a row of
 * them reads as "username", "role", "display rank" instead of "anyone", "any
 * rank" jammed together with nothing saying which is which.
 */
export function AdminToolbar({
  children,
  note,
  action,
  className,
}: {
  children?: ReactNode;
  /** The count sentence a list ends its toolbar with, styled as data. */
  note?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end gap-3", className)}>
      {children}
      {note || action ? (
        <div className="ml-auto flex flex-wrap items-center gap-3">
          {note ? (
            <span className="font-mono text-mono tabular-nums text-muted-foreground">{note}</span>
          ) : null}
          {action}
        </div>
      ) : null}
    </div>
  );
}

/**
 * One filter in an `AdminToolbar`: a control under its own label, laid out the
 * way `AdminForm` lays out a field.
 *
 * A select holds a floor width so a row of them lines up and none of them
 * clips its longest option; `grow` is for the search box, which takes whatever
 * the selects leave up to a readable maximum. The control itself is stretched
 * to the cell, so a call site sizes the filter here rather than on the control.
 */
export function AdminFilter({
  label,
  grow = false,
  children,
  className,
}: {
  label: ReactNode;
  grow?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Field label={label} className={cn("min-w-40 *:w-full", grow && "min-w-56 max-w-sm flex-1", className)}>
      {children}
    </Field>
  );
}

/** "1 to 50 of 812" plus the page window, on one line under a list. */
export function AdminPager({
  page,
  pageSize,
  total,
  hrefFor,
  summary,
}: {
  page: number;
  pageSize: number;
  total: number;
  hrefFor: (page: number) => string;
  /** The whole count sentence, from the caller, which knows what it counts.
   *  The pager hands over the range it worked out and nothing else: the noun
   *  inflects with the number in front of it and does not always follow that
   *  number, so there is no frame here for a bare noun to drop into. */
  summary: (range: { from: number; to: number; total: number }) => ReactNode;
}) {
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="font-mono text-sm tabular-nums text-muted-foreground">
        {summary({ from, to, total })}
      </span>
      <div className="ml-auto">
        <Pagination page={page} totalPages={totalPages} hrefFor={hrefFor} />
      </div>
    </div>
  );
}
