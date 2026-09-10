import type { HTMLAttributes, TableHTMLAttributes } from "react";
import { cn } from "../cn";

export type TableProps = TableHTMLAttributes<HTMLTableElement> & {
  striped?: boolean;
  scrollable?: boolean;
};

export function Table({ striped = true, scrollable = true, className, children, ...rest }: TableProps) {
  const table = (
    <table className={cn("table", striped && "striped", className)} {...rest}>
      {children}
    </table>
  );
  return scrollable ? <div className="h-scrollable-table">{table}</div> : table;
}

export function EmptyRow({
  colSpan,
  children,
  ...rest
}: HTMLAttributes<HTMLTableCellElement> & { colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} style={{ color: "var(--muted)", padding: "1.6em 0" }} {...rest}>
        {children}
      </td>
    </tr>
  );
}
