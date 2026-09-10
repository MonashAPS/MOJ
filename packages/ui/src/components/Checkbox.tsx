"use client";

import * as RadixCheckbox from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../cn";

export function Checkbox({
  checked,
  onCheckedChange,
  label,
  id,
  disabled,
  value,
  name,
  className,
}: {
  checked: boolean | "indeterminate";
  onCheckedChange: (checked: boolean) => void;
  label?: ReactNode;
  id?: string;
  disabled?: boolean;
  value?: string;
  name?: string;
  className?: string;
}) {
  const control = (
    <RadixCheckbox.Root
      id={id}
      name={name}
      value={value}
      checked={checked}
      disabled={disabled}
      onCheckedChange={(next) => onCheckedChange(next === true)}
      className={cn("checkbox", className)}
    >
      <RadixCheckbox.Indicator>
        {checked === "indeterminate" ? <Minus size={12} aria-hidden /> : <Check size={12} aria-hidden />}
      </RadixCheckbox.Indicator>
    </RadixCheckbox.Root>
  );
  if (!label) return control;
  return (
    <label className="check-label" htmlFor={id}>
      {control}
      <span>{label}</span>
    </label>
  );
}
