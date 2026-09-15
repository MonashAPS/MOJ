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
import { useTranslations } from "next-intl";
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

const STATE: Record<RequestRow["state"], { message: string; variant: "run" | "good" | "bad" }> = {
  P: { message: "statePending", variant: "run" },
  A: { message: "stateApproved", variant: "good" },
  R: { message: "stateRejected", variant: "bad" },
};

/** `organization/requests/pending.html` and `log.html`, as one table: approve and
 *  reject act on a single row, which is what `OrganizationRequestView.post` does
 *  once the formset is applied. */
export function RequestsTable({ rows, showActions }: { rows: RequestRow[]; showActions: boolean }) {
  const t = useTranslations("organizations.requests");
  const shared = useTranslations("organizations.common");
  const approve = useMutation(api.organizations.approve);
  const reject = useMutation(api.organizations.reject);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function act(id: string, action: "approve" | "reject", username: string) {
    setBusyId(id);

    try {
      if (action === "approve") await approve({ requestId: id as never });
      else await reject({ requestId: id as never });
      toast.success(action === "approve" ? t("approved", { username }) : t("rejected", { username }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : shared("failed"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("user")}</TableHead>
          <TableHead>{t("time")}</TableHead>
          <TableHead>{t("class")}</TableHead>
          <TableHead>{t("state")}</TableHead>
          <TableHead>{t("reason")}</TableHead>
          {showActions ? <TableHead className="w-44" /> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <EmptyRow colSpan={showActions ? 6 : 5}>{t("empty")}</EmptyRow>
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
                <Badge variant={STATE[row.state].variant}>{t(STATE[row.state].message)}</Badge>
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
                        {t("approve")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<X aria-hidden />}
                        disabled={busyId === row._id}
                        onClick={() => act(row._id, "reject", row.username)}
                      >
                        {t("reject")}
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
