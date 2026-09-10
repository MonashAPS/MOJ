"use client";

import { cn, focusRing } from "@moj/ui";
import type { ClipboardEvent, KeyboardEvent } from "react";
import { useId, useRef } from "react";

const SLOTS = [0, 1, 2, 3, 4, 5] as const;
const LENGTH = SLOTS.length;

export function OneTimeCode({
  value,
  onChange,
  onComplete,
  label,
  hint,
  invalid = false,
  disabled = false,
  autoFocus = false,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Fired the moment the sixth digit lands, so the form can submit itself. */
  onComplete?: (value: string) => void;
  label: string;
  hint?: string;
  invalid?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const id = useId();
  const labelId = `${id}-label`;
  const hintId = `${id}-hint`;
  const boxes = useRef<Array<HTMLInputElement | null>>([]);

  function focusSlot(slot: number) {
    boxes.current[Math.max(0, Math.min(slot, LENGTH - 1))]?.focus();
  }

  function commit(next: string) {
    const code = next.slice(0, LENGTH);
    onChange(code);
    if (code.length === LENGTH) onComplete?.(code);
    return code;
  }

  function handleInput(slot: number, raw: string) {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return;
    // A password manager or iOS autofill drops the whole code into one box.
    const next = commit(
      digits.length > 1
        ? value.slice(0, slot) + digits
        : value.slice(0, slot) + digits + value.slice(slot + 1),
    );
    focusSlot(digits.length > 1 ? next.length : slot + 1);
  }

  function handleKeyDown(slot: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace") {
      event.preventDefault();
      if (value[slot]) {
        commit(value.slice(0, slot) + value.slice(slot + 1));
        return;
      }
      if (slot > 0) {
        commit(value.slice(0, slot - 1) + value.slice(slot));
        focusSlot(slot - 1);
      }
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusSlot(slot - 1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      focusSlot(Math.min(slot + 1, value.length));
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    const digits = event.clipboardData.getData("text").replace(/\D/g, "");
    if (!digits) return;
    event.preventDefault();
    focusSlot(commit(digits).length);
  }

  return (
    <div role="group" aria-labelledby={labelId} aria-describedby={hint ? hintId : undefined}>
      <span id={labelId} className="sr-only">
        {label}
      </span>
      {hint ? (
        <span id={hintId} className="sr-only">
          {hint}
        </span>
      ) : null}

      <div className="flex justify-between gap-2">
        {SLOTS.map((slot) => (
          <input
            key={slot}
            ref={(node) => {
              boxes.current[slot] = node;
            }}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={1}
            autoComplete={slot === 0 ? "one-time-code" : "off"}
            // biome-ignore lint/a11y/noAutofocus: the code box is the only thing on this stage
            autoFocus={autoFocus && slot === 0}
            disabled={disabled}
            aria-invalid={invalid || undefined}
            aria-label={`Digit ${slot + 1} of ${LENGTH}`}
            value={value[slot] ?? ""}
            onChange={(event) => handleInput(slot, event.target.value)}
            onKeyDown={(event) => handleKeyDown(slot, event)}
            onPaste={handlePaste}
            onFocus={(event) => {
              if (slot > value.length) focusSlot(value.length);
              else event.currentTarget.select();
            }}
            className={cn(
              "h-12 w-11 rounded-md border border-input bg-background text-center",
              "font-mono text-h2 tabular-nums text-foreground",
              "shadow-[0_1px_0_var(--line-strong)] transition-[color,border-color,box-shadow]",
              "disabled:cursor-not-allowed disabled:opacity-50",
              focusRing,
            )}
          />
        ))}
      </div>
    </div>
  );
}
