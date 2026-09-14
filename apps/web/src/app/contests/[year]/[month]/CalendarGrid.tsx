import type { CalendarPayload } from "@convex/contests";
import { Button, cn } from "@moj/ui";
import { ChevronLeft, ChevronRight, Play, StepBack, StepForward } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** `contest/calendar.html`: a month grid where each day lists the contests that
 *  start, run within, or end on it. */
export function CalendarGrid({ calendar }: { calendar: NonNullable<CalendarPayload> }) {
  const t = useTranslations("contests.calendar");
  const today = new Date(calendar.now);
  const isThisMonth = calendar.year === today.getFullYear() && calendar.month === today.getMonth() + 1;

  return (
    <div className="grid min-w-0 gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {calendar.prevMonth ? (
            <Button asChild variant="secondary" size="sm" icon={<ChevronLeft aria-hidden />}>
              <Link href={`/contests/${calendar.prevMonth.year}/${calendar.prevMonth.month}/`}>
                {t("prev")}
              </Link>
            </Button>
          ) : null}
          {!isThisMonth ? (
            <Button asChild variant="ghost" size="sm">
              <Link href={`/contests/${today.getFullYear()}/${today.getMonth() + 1}/`}>{t("today")}</Link>
            </Button>
          ) : null}
          {calendar.nextMonth ? (
            <Button asChild variant="secondary" size="sm">
              <Link href={`/contests/${calendar.nextMonth.year}/${calendar.nextMonth.month}/`}>
                {t("next")}
                <ChevronRight size={14} aria-hidden />
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="min-w-0 overflow-hidden overflow-x-auto rounded-md border border-border bg-card">
        <table className="w-full border-collapse text-base">
          <thead>
            <tr>
              {WEEKDAYS.map((day) => (
                <th
                  key={day}
                  className="h-8 w-[14.28%] whitespace-nowrap bg-titlebar px-3 text-left align-middle font-sans text-xs font-semibold uppercase leading-none tracking-label text-titlebar-ink"
                >
                  <span className="hidden min-[760px]:inline">{t(`weekdays.${day}`)}</span>
                  <span className="min-[760px]:hidden">{t(`weekdaysShort.${day}`)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {calendar.weeks.map((week) => (
              <tr key={week[0]?.date ?? ""}>
                {week.map((day) => (
                  <td
                    key={day.date}
                    className={cn(
                      "h-24 min-w-[110px] border-b border-r border-border p-1.5 align-top last:border-r-0",
                      day.isPad && "bg-secondary/60 text-muted-foreground",
                      day.isToday && "bg-primary-soft",
                    )}
                  >
                    <span
                      className={cn(
                        "block font-mono text-sm tabular-nums",
                        day.isToday ? "font-semibold text-primary" : "text-muted-foreground",
                      )}
                    >
                      {Number.parseInt(day.date.slice(8), 10)}
                    </span>
                    <ul className="mt-1 grid gap-1">
                      {day.starts.map((contest) => (
                        <CalendarEntry key={`s-${contest._id}`} contest={contest} kind="start" />
                      ))}
                      {day.oneday.map((contest) => (
                        <CalendarEntry key={`o-${contest._id}`} contest={contest} kind="oneday" />
                      ))}
                      {day.ends.map((contest) => (
                        <CalendarEntry key={`e-${contest._id}`} contest={contest} kind="end" />
                      ))}
                    </ul>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CalendarEntry({
  contest,
  kind,
}: {
  contest: { _id: string; key: string; name: string };
  kind: "start" | "oneday" | "end";
}) {
  const t = useTranslations("contests.calendar");
  const Icon = kind === "start" ? StepForward : kind === "end" ? StepBack : Play;
  const label = kind === "start" ? t("entryStart") : kind === "end" ? t("entryEnd") : t("entryOneday");
  return (
    <li className="flex items-start gap-1.5 text-sm leading-tight">
      <Icon size={12} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
      <Link href={`/contest/${contest.key}/`} className="min-w-0">
        <span className="sr-only">{`${label} `}</span>
        {contest.name}
      </Link>
    </li>
  );
}
