"use client";

import { Check, ChevronsUpDown, X } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { cn } from "../cn";
import { disabledField, focusRing } from "../styles";
import { Button } from "./button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "./command";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

export type ComboboxOption = { value: string; label: string; hint?: ReactNode; disabled?: boolean };

/** Popover + Command. There is no combobox primitive; this is the composition. */
export function Combobox({
  value,
  onValueChange,
  options,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "Nothing matches.",
  id,
  disabled,
  invalid,
  ariaLabel,
  className,
}: {
  value?: string;
  onValueChange?: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  id?: string;
  disabled?: boolean;
  invalid?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="secondary"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          {selected?.label ?? placeholder}
          <ChevronsUpDown className="size-3.5 opacity-60" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-0">
        <Command>
          <CommandInput placeholder={searchPlaceholder} showEscHint={false} className="text-base" />
          <CommandList className="max-h-[280px]">
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  disabled={option.disabled}
                  onSelect={() => {
                    onValueChange?.(option.value);
                    setOpen(false);
                  }}
                  className="h-7"
                >
                  <span className="truncate">{option.label}</span>
                  {option.hint ? (
                    <span className="ml-auto font-mono text-sm tabular-nums text-muted-foreground">
                      {option.hint}
                    </span>
                  ) : null}
                  {option.value === value ? <Check className="ml-auto size-3.5 text-primary" /> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export type MultiSelectOption = ComboboxOption;

/** The same composition with chips above the input. Backspace on an empty filter
 *  removes the last chip. */
export function MultiSelect({
  values,
  onChange,
  options,
  placeholder = "Select…",
  searchPlaceholder = "Filter…",
  emptyText = "Nothing to choose from.",
  max,
  id,
  disabled,
  ariaLabel,
  className,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  options: MultiSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  max?: number;
  id?: string;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const byValue = useMemo(() => new Map(options.map((option) => [option.value, option])), [options]);
  const atMax = max !== undefined && values.length >= max;

  function toggle(value: string) {
    if (values.includes(value)) onChange(values.filter((item) => item !== value));
    else if (!atMax) onChange([...values, value]);
  }

  return (
    <div className={cn("grid gap-2", className)}>
      {values.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Chosen">
          {values.map((value) => (
            <li key={value}>
              <span className="inline-flex h-[22px] items-center gap-1 rounded-full border border-primary-line bg-primary-soft pl-2 pr-[2px] text-xs font-medium text-primary">
                <span className="truncate">{byValue.get(value)?.label ?? value}</span>
                <button
                  type="button"
                  aria-label={`Remove ${byValue.get(value)?.label ?? value}`}
                  onClick={() => onChange(values.filter((item) => item !== value))}
                  className={cn(
                    "flex size-4 items-center justify-center rounded-full text-primary/70 transition-colors hover:bg-primary/15 hover:text-primary",
                    focusRing,
                  )}
                >
                  <X className="size-3" aria-hidden />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            variant="secondary"
            role="combobox"
            aria-expanded={open}
            aria-label={ariaLabel}
            disabled={disabled}
            className={cn(
              "w-full justify-between font-normal",
              values.length === 0 && "text-muted-foreground",
              disabledField,
            )}
          >
            {values.length === 0
              ? placeholder
              : max !== undefined
                ? `${values.length} of ${max} chosen`
                : `${values.length} chosen`}
            <ChevronsUpDown className="size-3.5 opacity-60" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-0">
          <Command>
            <CommandInput
              value={term}
              onValueChange={setTerm}
              placeholder={searchPlaceholder}
              showEscHint={false}
              className="text-base"
              onKeyDown={(event) => {
                if (event.key === "Backspace" && term.length === 0 && values.length > 0) {
                  onChange(values.slice(0, -1));
                }
              }}
            />
            <CommandList className="max-h-[280px]">
              <CommandEmpty>{emptyText}</CommandEmpty>
              <CommandGroup>
                {options.map((option) => {
                  const selected = values.includes(option.value);
                  return (
                    <CommandItem
                      key={option.value}
                      value={option.label}
                      disabled={option.disabled || (!selected && atMax)}
                      onSelect={() => toggle(option.value)}
                      className="h-7"
                    >
                      <span className="truncate">{option.label}</span>
                      {selected ? <Check className="ml-auto size-3.5 text-primary" aria-hidden /> : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
