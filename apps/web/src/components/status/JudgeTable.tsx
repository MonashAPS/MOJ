import type { JudgeRow } from "@convex/judges";
import {
  Badge,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
} from "@moj/ui";
import { ServerOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { DASH } from "@/lib/submissionFormat";

/** `judge.uptime|timedelta('localized')`, compact. */
export function formatUptime(ms: number | null): string {
  if (ms === null || ms <= 0) return DASH;
  const seconds = Math.floor(ms / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;

  if (hours > 0) return `${hours}h ${minutes}m`;

  return `${minutes}m`;
}

/**
 * `status/judge-status-table.html`. Presentational: `StatusTable` feeds it the
 * live rows, and it says nothing about where they came from.
 */
export function JudgeTable({ judges, seeAll }: { judges: JudgeRow[]; seeAll: boolean }) {
  const t = useTranslations("status.judges");
  const states = useTranslations("common.states");

  if (judges.length === 0) {
    return (
      <EmptyState
        icon={<ServerOff aria-hidden />}
        title={t("emptyTitle")}
        description={t("emptyDescription")}
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("judge")}</TableHead>
          {seeAll ? <TableHead>{t("status")}</TableHead> : null}
          <TableHead numeric>{t("uptime")}</TableHead>
          <TableHead numeric>{t("ping")}</TableHead>
          <TableHead numeric>{t("load")}</TableHead>
          <TableHead numeric>{t("tier")}</TableHead>
          <TableHead>{t("runtimes")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {judges.map((judge) => (
          <TableRow key={judge.name}>
            <TableCell className="whitespace-nowrap font-mono text-mono font-medium text-foreground">
              {judge.name}
            </TableCell>
            {seeAll ? (
              <TableCell className="whitespace-nowrap">
                <Badge variant={judge.online ? "good" : "neutral"}>
                  {judge.online ? states("online") : states("offline")}
                </Badge>
              </TableCell>
            ) : null}
            <TableCell numeric>{judge.online ? formatUptime(judge.uptime) : DASH}</TableCell>
            <TableCell numeric>
              {judge.online && judge.pingMs !== null ? (
                <>
                  {judge.pingMs.toFixed(3)}
                  <span className="text-muted-foreground"> ms</span>
                </>
              ) : (
                DASH
              )}
            </TableCell>
            <TableCell numeric>
              {judge.online && judge.load !== null ? judge.load.toFixed(3) : DASH}
            </TableCell>
            <TableCell numeric>{judge.tier}</TableCell>
            <TableCell className="font-mono text-mono text-subtle">
              {judge.runtimes.length === 0 ? (
                DASH
              ) : (
                <span className="flex flex-wrap gap-x-2 gap-y-1">
                  {judge.runtimes.map((runtime) => (
                    <Tooltip
                      key={runtime.key}
                      content={runtime.runtimes
                        .map((entry) => `${entry.name} ${entry.version}`.trim())
                        .join(", ")}
                    >
                      <span className="cursor-help underline decoration-dotted underline-offset-2">
                        {runtime.name}
                      </span>
                    </Tooltip>
                  ))}
                </span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
