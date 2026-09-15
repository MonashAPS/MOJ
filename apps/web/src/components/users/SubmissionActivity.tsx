"use client";

import { Button, cn, MicroLabel } from "@moj/ui";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { type SyntheticEvent, useMemo, useState } from "react";

/** The grid's rows and columns are named in the catalogue, so the keys rather
 *  than the names are what the layout is indexed by. */
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
] as const;

const LEVELS = 5;

/** The heat ramp's steps, `--heat-0` to `--heat-4`. */
const HEAT_STEPS = [0, 1, 2, 3, 4];

/** GitHub's proportions: an 11px square on a 13px pitch, so a year is 53 columns
 *  wide however the panel around it is sized. */
const CELL = 11;

const GAP = 2;

const LABEL_WIDTH = 28;

/** Fixed both ways, so a cell is a square whatever the column it lands in. */
const CELL_BOX = { width: CELL, height: CELL, aspectRatio: "1" } as const;

/** A month label needs two columns of room before the next one starts. */
const MONTH_LABEL_COLUMNS = 2;

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

/** A week is a column of seven slots, padded at both ends so every row holds the
 *  same number of cells and the columns line up under the month labels. */
function buildWeeks(days: Day[]): (Day | null)[][] {
  const weeks: (Day | null)[][] = [];
  let column: (Day | null)[] = new Array(7).fill(null);
  let filled = false;

  for (const day of days) {
    if (day.weekday === 0 && filled) {
      weeks.push(column);
      column = new Array(7).fill(null);
    }

    column[day.weekday] = day;
    filled = true;
  }

  if (filled) weeks.push(column);

  return weeks;
}

/** GitHub labels a month over the first column that *starts* in it, and skips a
 *  label with no room before the next one. The header is a row of spans so the
 *  label sits exactly over its column. */
function buildMonths(weeks: (Day | null)[][], names: string[]) {
  const labels: { key: string; column: number; label: string }[] = [];
  let previousMonth = -1;

  for (const [column, week] of weeks.entries()) {
    const day = week.find((slot): slot is Day => slot !== null);

    if (!day) continue;
    const month = day.date.getMonth();

    if (month === previousMonth) continue;
    previousMonth = month;
    const last = labels[labels.length - 1];

    if (last && column - last.column < MONTH_LABEL_COLUMNS) continue;
    const label = names[month];

    if (label === undefined) continue;
    labels.push({ key: `${day.date.getFullYear()}-${month}`, column, label });
  }

  const spans: { key: string; span: number; label: string }[] = [];
  let cursor = 0;

  for (const [index, label] of labels.entries()) {
    if (label.column > cursor) {
      spans.push({ key: `lead-${cursor}`, span: label.column - cursor, label: "" });
    }

    const next = labels[index + 1]?.column ?? weeks.length;
    spans.push({ key: label.key, span: next - label.column, label: label.label });
    cursor = next;
  }

  if (cursor < weeks.length) spans.push({ key: "tail", span: weeks.length - cursor, label: "" });

  return spans;
}

/**
 * DMOJ's submission heatmap, on the design system's green rather than GitHub's,
 * laid out on GitHub's proportions: fixed 11px squares that never stretch, month
 * labels over the column each month starts in, and the whole grid scrolling
 * sideways when the panel is too narrow for a year. One delegated tooltip serves
 * all 365 cells; the cells carry their own labels so the information is not
 * hover-only.
 */
export function SubmissionActivity({
  counts,
  minYear,
}: {
  counts: Record<string, number>;
  minYear: number | null;
}) {
  const t = useTranslations("users.activity");
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [hint, setHint] = useState<{ text: string; x: number; y: number } | null>(null);

  const days = useMemo(() => buildDays(year, currentYear, counts), [year, currentYear, counts]);
  const weeks = useMemo(() => buildWeeks(days), [days]);
  const monthNames = useMemo(() => MONTHS.map((month) => t(`months.${month}`)), [t]);
  const months = useMemo(() => buildMonths(weeks, monthNames), [weeks, monthNames]);
  const total = days.reduce((sum, day) => sum + day.activity, 0);
  const max = Math.max(1, ...days.map((day) => day.activity));

  // `border-spacing` sits between the columns and around the outside of them.
  const tableWidth = LABEL_WIDTH + weeks.length * CELL + (weeks.length + 2) * GAP;

  function describe(day: Day) {
    return t("cell", { count: day.activity, date: LABEL_DATE.format(day.date) });
  }

  function onCellOver(event: SyntheticEvent<HTMLTableSectionElement>) {
    const cell =
      event.target instanceof HTMLElement ? event.target.closest<HTMLElement>("[data-activity-label]") : null;

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
      x: cellBox.left - rootBox.left + container.scrollLeft + cellBox.width / 2,
      y: cellBox.top - rootBox.top,
    });
  }

  return (
    <section aria-labelledby="submission-activity-heading" className="min-w-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 id="submission-activity-heading" className="font-display text-h3 font-semibold text-foreground">
          {year === currentYear
            ? t("totalLastYear", { count: total })
            : t("totalInYear", { count: total, year: String(year) })}
        </h3>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("previousYear")}
            title={year <= (minYear ?? currentYear) ? t("noEarlierYear") : t("previousYear")}
            disabled={year <= (minYear ?? currentYear)}
            onClick={() => setYear((value) => value - 1)}
          >
            <ChevronLeft aria-hidden />
          </Button>
          <span className="min-w-16 text-center font-mono text-mono tabular-nums text-subtle">
            {year === currentYear ? t("pastYear") : year}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("nextYear")}
            title={year >= currentYear ? t("noLaterYear") : t("nextYear")}
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
        <table className="table-fixed border-separate" style={{ width: tableWidth, borderSpacing: GAP }}>
          <caption className="sr-only">
            {year === currentYear ? t("captionLastYear") : t("captionYear", { year: String(year) })}
          </caption>
          <colgroup>
            <col style={{ width: LABEL_WIDTH }} />
            {weeks.map((_week, column) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: a column is its week number
              <col key={`week-${column}`} style={{ width: CELL }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="p-0" />
              {months.map((month) => (
                <th
                  key={month.key}
                  colSpan={month.span}
                  scope="colgroup"
                  className="whitespace-nowrap p-0 text-left align-bottom font-sans text-[10px] font-normal leading-none text-muted-foreground"
                >
                  {month.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody
            onMouseOver={onCellOver}
            onFocus={onCellOver}
            onMouseLeave={() => setHint(null)}
            onBlur={() => setHint(null)}
          >
            {WEEKDAYS.map((weekdayKey, weekday) => (
              <tr key={weekdayKey}>
                <th
                  scope="row"
                  className="p-0 pr-1 text-right align-middle font-sans text-[10px] font-normal text-muted-foreground"
                  style={{ height: CELL, lineHeight: `${CELL}px` }}
                >
                  <span className="sr-only">{t(`weekdays.${weekdayKey}`)}</span>
                  <span aria-hidden="true">{weekday % 2 === 1 ? t(`weekdaysShort.${weekdayKey}`) : ""}</span>
                </th>
                {weeks.map((week, column) => {
                  const day = week[weekday];

                  if (!day) {
                    return (
                      <td
                        // biome-ignore lint/suspicious/noArrayIndexKey: a padding cell has no identity
                        key={`blank-${weekday}-${column}`}
                        className="p-0"
                      >
                        <div style={CELL_BOX} />
                      </td>
                    );
                  }

                  const level = Math.ceil((day.activity / max) * (LEVELS - 1));

                  return (
                    <td
                      key={day.key}
                      data-activity-label={describe(day)}
                      aria-label={describe(day)}
                      className="p-0"
                    >
                      <div
                        className="rounded-[2px]"
                        style={{ ...CELL_BOX, background: `var(--heat-${level})` }}
                      />
                    </td>
                  );
                })}
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
          <MicroLabel>{t("total", { count: total })}</MicroLabel>
          <div className="flex items-center gap-1">
            <MicroLabel>{t("less")}</MicroLabel>
            {HEAT_STEPS.map((level) => (
              <span
                key={level}
                className="shrink-0 rounded-[2px]"
                style={{ ...CELL_BOX, background: `var(--heat-${level})` }}
              />
            ))}
            <MicroLabel>{t("more")}</MicroLabel>
          </div>
        </div>
      </div>
    </section>
  );
}
