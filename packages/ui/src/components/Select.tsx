"use client";

import * as RadixSelect from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "../cn";

export type SelectOption = { value: string; label: string; disabled?: boolean };

export function Select({
  value,
  defaultValue,
  onValueChange,
  options,
  placeholder = "Select...",
  name,
  id,
  className,
  disabled,
  invalid,
  ariaLabel,
}: {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  name?: string;
  id?: string;
  className?: string;
  disabled?: boolean;
  invalid?: boolean;
  ariaLabel?: string;
}) {
  return (
    <RadixSelect.Root
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      name={name}
      disabled={disabled}
    >
      <RadixSelect.Trigger
        id={id}
        aria-label={ariaLabel}
        className={cn("control", invalid && "invalid", className)}
      >
        <RadixSelect.Value className="select-value" placeholder={placeholder} />
        <RadixSelect.Icon className="control-icon" style={{ marginLeft: "auto" }}>
          <ChevronDown size={15} aria-hidden />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content position="popper" sideOffset={4} className="popover-panel">
          <RadixSelect.Viewport>
            {options.map((option) => (
              <RadixSelect.Item
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                className="option"
              >
                <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                <RadixSelect.ItemIndicator className="option-check">
                  <Check size={14} aria-hidden />
                </RadixSelect.ItemIndicator>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
