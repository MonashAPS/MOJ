"use client";

import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronDown, X } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "../cn";

export type MultiSelectOption = { value: string; label: string; disabled?: boolean };

/** Combobox with chips. Used for organisations on the registration form and
 *  anywhere else a bounded multi choice is needed. Keyboard: the trigger opens
 *  on Enter or Space, the filter takes focus, arrows move through options and
 *  Enter toggles the highlighted one. */
export function MultiSelect({
  values,
  onChange,
  options,
  placeholder = "Select...",
  max,
  id,
  disabled,
  emptyText = "Nothing to choose from.",
  searchPlaceholder = "Filter...",
  ariaLabel,
  className,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  options: MultiSelectOption[];
  placeholder?: string;
  max?: number;
  id?: string;
  disabled?: boolean;
  emptyText?: string;
  searchPlaceholder?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");

  const byValue = useMemo(() => new Map(options.map((option) => [option.value, option])), [options]);
  const filtered = useMemo(() => {
    const needle = term.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) => option.label.toLowerCase().includes(needle));
  }, [options, term]);

  const atMax = max !== undefined && values.length >= max;

  function toggle(value: string) {
    if (values.includes(value)) onChange(values.filter((item) => item !== value));
    else if (!atMax) onChange([...values, value]);
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      {/* The chips carry their own remove buttons, so the field cannot itself be
          a button: it is a plain box with the opener stretching across the rest. */}
      <div className={cn("control", "chip-field", className)}>
        {values.map((value) => (
          <span key={value} className="chip">
            <span className="chip-label">{byValue.get(value)?.label ?? value}</span>
            <button
              type="button"
              className="chip-remove"
              aria-label={`Remove ${byValue.get(value)?.label ?? value}`}
              onClick={() => onChange(values.filter((item) => item !== value))}
            >
              <X size={12} aria-hidden />
            </button>
          </span>
        ))}
        <Popover.Trigger asChild>
          <button
            type="button"
            id={id}
            disabled={disabled}
            aria-label={ariaLabel}
            aria-haspopup="listbox"
            aria-expanded={open}
            className="chip-open"
          >
            {values.length === 0 ? <span className="select-value">{placeholder}</span> : null}
            <span className="control-icon" style={{ marginLeft: "auto" }}>
              <ChevronDown size={15} aria-hidden />
            </span>
          </button>
        </Popover.Trigger>
      </div>
      <Popover.Portal>
        <Popover.Content
          sideOffset={4}
          align="start"
          className="popover-panel"
          style={{ width: "var(--radix-popover-trigger-width)" }}
        >
          {options.length > 6 ? (
            <input
              className="control"
              style={{ marginBottom: "var(--space-1)" }}
              placeholder={searchPlaceholder}
              value={term}
              onChange={(event) => setTerm(event.target.value)}
            />
          ) : null}
          {filtered.length === 0 ? (
            <p className="option-empty">{emptyText}</p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {filtered.map((option) => {
                const selected = values.includes(option.value);
                return (
                  <li key={option.value}>
                    <button
                      type="button"
                      className="option"
                      aria-pressed={selected}
                      disabled={option.disabled || (!selected && atMax)}
                      data-state={selected ? "checked" : undefined}
                      onClick={() => toggle(option.value)}
                    >
                      <span>{option.label}</span>
                      {selected ? (
                        <span className="option-check">
                          <Check size={14} aria-hidden />
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {max !== undefined ? (
            <p className="field-hint" style={{ padding: "var(--space-1) var(--space-2) 0" }}>
              {values.length} of {max} selected
            </p>
          ) : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
