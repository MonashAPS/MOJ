"use client";

import * as RadixRadioGroup from "@radix-ui/react-radio-group";
import type { ReactNode } from "react";
import { cn } from "../cn";

export type RadioOption = { value: string; label: ReactNode; disabled?: boolean };

export function RadioGroup({
  value,
  onValueChange,
  options,
  name,
  ariaLabel,
  orientation = "vertical",
  className,
}: {
  value?: string;
  onValueChange?: (value: string) => void;
  options: RadioOption[];
  name?: string;
  ariaLabel?: string;
  orientation?: "vertical" | "horizontal";
  className?: string;
}) {
  return (
    <RadixRadioGroup.Root
      value={value}
      onValueChange={onValueChange}
      name={name}
      aria-label={ariaLabel}
      orientation={orientation}
      className={cn(className)}
      style={{
        display: "flex",
        flexDirection: orientation === "vertical" ? "column" : "row",
        gap: "var(--space-2)",
      }}
    >
      {options.map((option) => {
        const id = `${name ?? "radio"}-${option.value}`;
        return (
          <label key={option.value} className="check-label" htmlFor={id}>
            <RadixRadioGroup.Item id={id} value={option.value} disabled={option.disabled} className="radio">
              <RadixRadioGroup.Indicator className="radio-indicator" />
            </RadixRadioGroup.Item>
            <span>{option.label}</span>
          </label>
        );
      })}
    </RadixRadioGroup.Root>
  );
}
