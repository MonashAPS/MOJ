"use client";

import { api } from "@convex/_generated/api";
import {
  Badge,
  Button,
  EmptyRow,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from "@moj/ui";
import { useMutation } from "convex/react";
import { Check, X } from "lucide-react";
import { useState } from "react";
import { UserLink } from "@/components/users/UserLink";
import { formatDateTime } from "@/lib/format";

export type RequestRow = {
  _id: string;
  username: string;
  displayName: string;
  time: number;
  state: "P" | "A" | "R";
  reason: string;
  className: string | null;
};

const STATE: Record<RequestRow["state"], { label: string; variant: "run" | "good" | "bad" }> = {
  P: { label: "Pending", variant: "run" },
  A: { label: "Approved", variant: "good" },
  R: { label: "Rejected", variant: "bad" },
};

/** `organization/requests/pending.html` and `log.html`, as one table: approve and
 *  reject act on a single row, which is what `OrganizationRequestView.post` does
 *  once the formset is applied. */
export function RequestsTable({ rows, showActions }: { rows: RequestRow[]; showActions: boolean }) {
  const approve = useMutation(api.organizations.approve);
  const reject = useMutation(api.organizations.reject);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function act(id: string, action: "approve" | "reject", username: string) {
    setBusyId(id);
    try {
      if (action === "approve") await approve({ requestId: id as never });
      else await reject({ requestId: id as never });
      toast.success(
        action === "approve" ? `${username} is now a member.` : `${username}'s request was rejected.`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That did not work.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>User</TableHead>
          <TableHead>Time</TableHead>
          <TableHead>Class</TableHead>
          <TableHead>State</TableHead>
          <TableHead>Reason</TableHead>
          {showActions ? <TableHead className="w-44" /> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <EmptyRow colSpan={showActions ? 6 : 5}>There are no requests to approve.</EmptyRow>
        ) : (
          rows.map((row) => (
            <TableRow key={row._id}>
              <TableCell className="whitespace-nowrap">
                <UserLink username={row.username} displayName={row.displayName} />
              </TableCell>
              <TableCell className="whitespace-nowrap font-mono text-sm tabular-nums text-subtle">
                {formatDateTime(row.time)}
              </TableCell>
              <TableCell className="text-subtle">{row.className ?? "—"}</TableCell>
              <TableCell>
                <Badge variant={STATE[row.state].variant}>{STATE[row.state].label}</Badge>
              </TableCell>
              <TableCell className="max-w-[28rem] text-subtle">{row.reason}</TableCell>
              {showActions ? (
                <TableCell className="py-0 text-right">
                  {row.state === "P" ? (
                    <span className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        icon={<Check aria-hidden />}
                        busy={busyId === row._id}
                        onClick={() => act(row._id, "approve", row.username)}
                      >
                        Approve
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<X aria-hidden />}
                        disabled={busyId === row._id}
                        onClick={() => act(row._id, "reject", row.username)}
                      >
                        Reject
                      </Button>
                    </span>
                  ) : null}
                </TableCell>
              ) : null}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
