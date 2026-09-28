"use client";

import { Button, cn, Input, Popover, PopoverContent, PopoverTrigger } from "@moj/ui";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useMemo, useState } from "react";
import { useCountdownNow } from "@/lib/CountdownProvider";
import { useViewerTimeZone } from "@/lib/date-format";
import { utcOffset, zonedDate, zonedTimestamp } from "@/lib/zoned-date";

/** The catalogue keys the picker reads its month and weekday names by. The
 *  short month is a message of its own rather than the first three letters of
 *  the long one, which is a cut only English survives. */
const MONTH_KEYS = [
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
];

const WEEKDAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

/** Monday-first grid of the weeks a month touches. */
function monthGrid(month: Date): Date[] {
  const first = startOfMonth(month);
  const offset = (first.getUTCDay() + 6) % 7;
  const start = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1 - offset));

  return Array.from(
    { length: 42 },
    (_unused, index) =>
      new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + index)),
  );
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

/**
 * A date and a time, with no native `<input type="date">` anywhere (DESIGN
 * section 23): a Popover holding a month grid of buttons, plus a mono time box.
 */
export function DateTimeField({
  value,
  onChange,
  id,
  disabled,
  clearable = false,
  ariaLabel,
  className,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  id?: string;
  disabled?: boolean;
  clearable?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  const t = useTranslations("admin.components.dateTime");
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const [open, setOpen] = useState(false);
  const timeZone = useViewerTimeZone();
  const now = useCountdownNow() ?? 0;
  const today = timeZone ? zonedDate(now, timeZone) : new Date(0);
  const selected = value === null || !timeZone ? null : zonedDate(value, timeZone);
  const [month, setMonth] = useState<Date>(startOfMonth(selected ?? today));
  const days = useMemo(() => monthGrid(month), [month]);
  const months = MONTH_KEYS.map((key) => t(`months.${key}`));
  const monthsShort = MONTH_KEYS.map((key) => t(`monthsShort.${key}`));

  function pick(day: Date) {
    if (!timeZone) return;
    const base = selected ?? today;
    onChange(
      zonedTimestamp(
        new Date(
          Date.UTC(
            day.getUTCFullYear(),
            day.getUTCMonth(),
            day.getUTCDate(),
            base.getUTCHours(),
            base.getUTCMinutes(),
            0,
            0,
          ),
        ),
        timeZone,
      ),
    );
  }

  function setTime(text: string) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim());

    if (!match) return;
    const hours = Math.min(23, Number(match[1]));
    const minutes = Math.min(59, Number(match[2]));

    if (!timeZone) return;
    const base = selected ?? today;
    onChange(
      zonedTimestamp(
        new Date(
          Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), hours, minutes, 0, 0),
        ),
        timeZone,
      ),
    );
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (next) setMonth(startOfMonth(selected ?? today));
          setOpen(next);
        }}
      >
        <PopoverTrigger asChild>
          <Button
            id={fieldId}
            variant="secondary"
            size="sm"
            disabled={disabled || !timeZone}
            aria-label={ariaLabel}
            icon={<CalendarDays aria-hidden />}
            className="min-w-[168px] justify-start font-mono tabular-nums"
          >
            {selected
              ? `${pad(selected.getUTCDate())} ${monthsShort[selected.getUTCMonth()]} ${selected.getUTCFullYear()}`
              : timeZone
                ? t("pickDate")
                : "—"}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-3">
          <div className="mb-2 flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("previousMonth")}
              onClick={() => setMonth(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - 1, 1)))}
            >
              <ChevronLeft aria-hidden />
            </Button>
            <span className="flex-1 text-center text-base font-medium text-foreground">
              {months[month.getUTCMonth()]} {month.getUTCFullYear()}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("nextMonth")}
              onClick={() => setMonth(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1)))}
            >
              <ChevronRight aria-hidden />
            </Button>
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {WEEKDAY_KEYS.map((key) => (
              <span
                key={key}
                className="flex size-8 items-center justify-center font-sans text-xs font-semibold uppercase tracking-label text-muted-foreground"
              >
                {t(`weekdays.${key}`)}
              </span>
            ))}
            {days.map((day) => {
              const outside = day.getUTCMonth() !== month.getUTCMonth();
              const isSelected = !!selected && sameDay(day, selected);

              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => {
                    pick(day);
                    setOpen(false);
                  }}
                  aria-current={isSelected ? "date" : undefined}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-md font-mono text-mono tabular-nums",
                    "transition-colors hover:bg-row-hover",
                    "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-royal/45",
                    outside ? "text-muted-foreground/60" : "text-foreground",
                    sameDay(day, today) && !isSelected && "ring-1 ring-royal",
                    isSelected && "bg-primary text-primary-foreground hover:bg-primary-hover",
                  )}
                >
                  {day.getUTCDate()}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      <Input
        mono
        aria-label={t("timeAria", { label: ariaLabel ?? t("time") })}
        disabled={disabled || !timeZone || selected === null}
        title={selected === null ? t("pickDateFirst") : undefined}
        defaultValue={selected ? `${pad(selected.getUTCHours())}:${pad(selected.getUTCMinutes())}` : ""}
        key={selected ? `${selected.getUTCHours()}:${selected.getUTCMinutes()}` : "empty"}
        placeholder="00:00"
        onBlur={(event) => setTime(event.target.value)}
        className="h-(--control-h-sm) w-[76px] px-2 text-center"
      />

      {timeZone ? (
        <span className="text-xs text-muted-foreground">
          {timeZone} ({utcOffset(value ?? now, timeZone)})
        </span>
      ) : null}

      {clearable && selected ? (
        <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
          {t("clearDate")}
        </Button>
      ) : null}
    </div>
  );
}
