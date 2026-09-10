"use client";

import * as RadixSwitch from "@radix-ui/react-switch";
import type { ReactNode } from "react";
import { cn } from "../cn";

export function Toggle({
  checked,
  onCheckedChange,
  label,
  id,
  disabled,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: ReactNode;
  id?: string;
  disabled?: boolean;
  className?: string;
}) {
  const control = (
    <RadixSwitch.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      className={cn("switch", className)}
    >
      <RadixSwitch.Thumb className="switch-thumb" />
    </RadixSwitch.Root>
  );
  if (!label) return control;
  return (
    <label className="check-label" htmlFor={id}>
      {control}
      <span>{label}</span>
    </label>
  );
}
