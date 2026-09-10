"use client";

import { Button, cn, Input, Popover, PopoverContent, PopoverTrigger } from "@moj/ui";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useId, useMemo, useState } from "react";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** `2026-09-10 19:30`, in the viewer's own zone, which is the club's. */
export function formatMoment(ms: number | null): string {
  if (ms === null) return "—";
  const date = new Date(ms);
  return `${date.getDate()} ${MONTHS[date.getMonth()]?.slice(0, 3)} ${date.getFullYear()}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/** Monday-first grid of the weeks a month touches. */
function monthGrid(month: Date): Date[] {
  const first = startOfMonth(month);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset);
  return Array.from(
    { length: 42 },
    (_unused, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index),
  );
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
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
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const [open, setOpen] = useState(false);
  const selected = value === null ? null : new Date(value);
  const [month, setMonth] = useState<Date>(startOfMonth(selected ?? new Date()));
  const days = useMemo(() => monthGrid(month), [month]);
  const today = new Date();

  function pick(day: Date) {
    const base = selected ?? new Date();
    onChange(
      new Date(
        day.getFullYear(),
        day.getMonth(),
        day.getDate(),
        base.getHours(),
        base.getMinutes(),
        0,
        0,
      ).getTime(),
    );
  }

  function setTime(text: string) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
    if (!match) return;
    const hours = Math.min(23, Number(match[1]));
    const minutes = Math.min(59, Number(match[2]));
    const base = selected ?? new Date();
    onChange(new Date(base.getFullYear(), base.getMonth(), base.getDate(), hours, minutes, 0, 0).getTime());
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={fieldId}
            variant="secondary"
            size="sm"
            disabled={disabled}
            aria-label={ariaLabel}
            icon={<CalendarDays aria-hidden />}
            className="min-w-[168px] justify-start font-mono tabular-nums"
          >
            {selected
              ? `${pad(selected.getDate())} ${MONTHS[selected.getMonth()]?.slice(0, 3)} ${selected.getFullYear()}`
              : "Pick a date"}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-3">
          <div className="mb-2 flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Previous month"
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
            >
              <ChevronLeft aria-hidden />
            </Button>
            <span className="flex-1 text-center text-base font-medium text-foreground">
              {MONTHS[month.getMonth()]} {month.getFullYear()}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Next month"
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
            >
              <ChevronRight aria-hidden />
            </Button>
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {WEEKDAYS.map((weekday) => (
              <span
                key={weekday}
                className="flex size-8 items-center justify-center font-sans text-xs font-semibold uppercase tracking-label text-muted-foreground"
              >
                {weekday}
              </span>
            ))}
            {days.map((day) => {
              const outside = day.getMonth() !== month.getMonth();
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
                  {day.getDate()}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      <Input
        mono
        aria-label={`${ariaLabel ?? "Time"} (24 hour)`}
        disabled={disabled || selected === null}
        title={selected === null ? "Pick a date first." : undefined}
        defaultValue={selected ? `${pad(selected.getHours())}:${pad(selected.getMinutes())}` : ""}
        key={selected ? `${selected.getHours()}:${selected.getMinutes()}` : "empty"}
        placeholder="00:00"
        onBlur={(event) => setTime(event.target.value)}
        className="h-(--control-h-sm) w-[76px] px-2 text-center"
      />

      {clearable && selected ? (
        <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
          Clear
        </Button>
      ) : null}
    </div>
  );
}
