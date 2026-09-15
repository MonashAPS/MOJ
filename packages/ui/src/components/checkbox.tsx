"use client";

import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn";
import { disabledField, focusRing } from "../styles";

export type CheckboxProps = Omit<ComponentProps<typeof CheckboxPrimitive.Root>, "onCheckedChange"> & {
  /** Renders the whole row as the hit area. */
  label?: ReactNode;
  labelClassName?: string;
  onCheckedChange?: (checked: boolean) => void;
};

export function Checkbox({ className, label, labelClassName, onCheckedChange, ...props }: CheckboxProps) {
  const control = (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      onCheckedChange={onCheckedChange ? (next) => onCheckedChange(next === true) : undefined}
      className={cn(
        "peer flex size-4 shrink-0 items-center justify-center rounded-xs border border-input bg-background",
        "text-primary-foreground transition-[background-color,border-color,box-shadow]",
        "data-[state=checked]:border-primary data-[state=checked]:bg-primary",
        "data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary",
        disabledField,
        focusRing,
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center"
      >
        {props.checked === "indeterminate" ? (
          <Minus className="size-3.5" aria-hidden />
        ) : (
          <Check className="size-3.5" aria-hidden />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );

  if (!label) return control;

  return (
    <label
      className={cn(
        "flex min-h-6 cursor-pointer items-center gap-2 text-base text-subtle",
        "hover:text-foreground has-disabled:cursor-not-allowed has-disabled:opacity-50",
        labelClassName,
      )}
      htmlFor={props.id}
    >
      {control}
      <span>{label}</span>
    </label>
  );
}
