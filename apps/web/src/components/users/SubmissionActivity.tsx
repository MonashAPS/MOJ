"use client";

import { Button, cn, MicroLabel } from "@moj/ui";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { type SyntheticEvent, useMemo, useState } from "react";

const WEEKDAYS = ["Sun", "Mon", "Tues", "Wed", "Thurs", "Fri", "Sat"];
const LEVELS = 5;
/** The heat ramp's steps, `--heat-0` to `--heat-4`. */
const HEAT_STEPS = [0, 1, 2, 3, 4];

type Day = { key: string; date: Date; weekday: number; activity: number };

function isoDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const LABEL_DATE = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric" });

/** `init_submission_table`: the current year is the *past* year, ending today;
 *  any other year is that whole calendar year. */
function buildDays(year: number, currentYear: number, counts: Record<string, number>): Day[] {
  let start: Date;
  let end: Date;
  if (year === currentYear) {
    end = new Date();
    start = new Date(end.getFullYear() - 1, end.getMonth(), end.getDate() + 1);
  } else {
    start = new Date(year, 0, 1);
    end = new Date(year + 1, 0, 0);
  }

  const days: Day[] = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const key = isoDate(cursor);
    days.push({
      key,
      date: new Date(cursor),
      weekday: cursor.getDay(),
      activity: counts[key] ?? 0,
    });
  }
  return days;
}

function plural(count: number, one: string, many: string) {
  return count === 1 ? `${count} ${one}` : `${count.toLocaleString("en-AU")} ${many}`;
}

/**
 * DMOJ's submission heatmap, on the club's green rather than GitHub's. One
 * delegated tooltip serves all 365 cells; the cells carry their own labels so the
 * information is not hover-only.
 */
export function SubmissionActivity({
  counts,
  minYear,
}: {
  counts: Record<string, number>;
  minYear: number | null;
}) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [hint, setHint] = useState<{ text: string; x: number; y: number } | null>(null);

  const days = useMemo(() => buildDays(year, currentYear, counts), [year, currentYear, counts]);
  const total = days.reduce((sum, day) => sum + day.activity, 0);
  const max = Math.max(1, ...days.map((day) => day.activity));

  // A week is a column; the first column is padded to the first day's weekday.
  const rows: (Day | null)[][] = WEEKDAYS.map(() => []);
  const lead = days[0]?.weekday ?? 0;
  for (let weekday = 0; weekday < lead; weekday++) rows[weekday]?.push(null);
  for (const day of days) rows[day.weekday]?.push(day);

  function describe(day: Day) {
    return `${plural(day.activity, "submission", "submissions")} on ${LABEL_DATE.format(day.date)}`;
  }

  function onCellOver(event: SyntheticEvent<HTMLTableSectionElement>) {
    const cell = (event.target as HTMLElement).closest<HTMLElement>("[data-activity-label]");
    if (!cell) {
      setHint(null);
      return;
    }
    const container = event.currentTarget.closest<HTMLElement>("[data-activity-root]");
    if (!container) return;
    const cellBox = cell.getBoundingClientRect();
    const rootBox = container.getBoundingClientRect();
    setHint({
      text: cell.dataset.activityLabel ?? "",
      x: cellBox.left - rootBox.left + cellBox.width / 2,
      y: cellBox.top - rootBox.top,
    });
  }

  return (
    <section aria-labelledby="submission-activity-heading" className="min-w-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 id="submission-activity-heading" className="font-display text-h3 font-semibold text-foreground">
          {year === currentYear
            ? `${plural(total, "submission", "submissions")} in the last year`
            : `${plural(total, "submission", "submissions")} in ${year}`}
        </h3>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Previous year"
            title={year <= (minYear ?? currentYear) ? "No submissions before this year." : "Previous year"}
            disabled={year <= (minYear ?? currentYear)}
            onClick={() => setYear((value) => value - 1)}
          >
            <ChevronLeft aria-hidden />
          </Button>
          <span className="min-w-16 text-center font-mono text-mono tabular-nums text-subtle">
            {year === currentYear ? "past year" : year}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Next year"
            title={year >= currentYear ? "This is the most recent year." : "Next year"}
            disabled={year >= currentYear}
            onClick={() => setYear((value) => value + 1)}
          >
            <ChevronRight aria-hidden />
          </Button>
        </div>
      </div>

      <div
        data-activity-root
        className="relative overflow-x-auto rounded-md border border-border bg-card p-3"
      >
        <table className="w-max border-separate border-spacing-[3px]">
          <caption className="sr-only">
            Submissions per day, {year === currentYear ? "over the last year" : `during ${year}`}
          </caption>
          <tbody
            onMouseOver={onCellOver}
            onFocus={onCellOver}
            onMouseLeave={() => setHint(null)}
            onBlur={() => setHint(null)}
          >
            {rows.map((week, weekday) => (
              <tr key={WEEKDAYS[weekday]}>
                <th
                  scope="row"
                  className="pr-1 text-right align-middle font-sans text-xs font-normal text-muted-foreground"
                >
                  {weekday % 2 === 1 ? WEEKDAYS[weekday] : ""}
                </th>
                {week.map((day, index) =>
                  day === null ? (
                    // biome-ignore lint/suspicious/noArrayIndexKey: a padding cell has no identity
                    <td key={`blank-${weekday}-${index}`} className="size-[11px]" />
                  ) : (
                    <td
                      key={day.key}
                      data-activity-label={describe(day)}
                      aria-label={describe(day)}
                      className="size-[11px] rounded-[2px]"
                      style={{
                        background: `var(--heat-${Math.ceil((day.activity / max) * (LEVELS - 1))})`,
                      }}
                    />
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {hint ? (
          <div
            role="status"
            className={cn(
              "pointer-events-none absolute z-(--z-tooltip) -translate-x-1/2 -translate-y-full",
              "rounded-sm bg-foreground px-2 py-[3px] text-xs text-background",
            )}
            style={{ left: hint.x, top: hint.y - 6 }}
          >
            {hint.text}
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
          <MicroLabel>{plural(total, "total submission", "total submissions")}</MicroLabel>
          <div className="flex items-center gap-1">
            <MicroLabel>Less</MicroLabel>
            {HEAT_STEPS.map((level) => (
              <span
                key={level}
                className="size-[11px] rounded-[2px]"
                style={{ background: `var(--heat-${level})` }}
              />
            ))}
            <MicroLabel>More</MicroLabel>
          </div>
        </div>
      </div>
    </section>
  );
}
