import { Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@moj/ui";

/** The list's own shape: the same frame, the same header and rows at `--row-h`
 *  with bars at the real column widths. Never a centred spinner for a list. */
export function StatusSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading judges">
      <Table aria-hidden>
        <TableHeader>
          <TableRow>
            <TableHead>Judge</TableHead>
            <TableHead>Status</TableHead>
            <TableHead numeric>Ping</TableHead>
            <TableHead numeric>Load</TableHead>
            <TableHead>Runtimes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rows }, (_, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: placeholder rows have no identity
            <TableRow key={index}>
              <TableCell>
                <Skeleton className="h-3 w-32" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-[18px] w-16 rounded-full" />
              </TableCell>
              <TableCell numeric>
                <Skeleton className="ml-auto h-3 w-14" />
              </TableCell>
              <TableCell numeric>
                <Skeleton className="ml-auto h-3 w-10" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-3 w-56 max-w-full" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
