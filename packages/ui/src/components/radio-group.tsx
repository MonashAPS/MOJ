"use client";

import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn";
import { disabledField, focusRing } from "../styles";

export type RadioOption = { value: string; label: ReactNode; disabled?: boolean; hint?: ReactNode };

export function RadioGroupItem({ className, ...props }: ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        "peer aspect-square size-4 shrink-0 rounded-full border border-input bg-background text-primary",
        "transition-[border-color,box-shadow] data-[state=checked]:border-primary",
        disabledField,
        focusRing,
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="relative flex size-full items-center justify-center after:block after:size-2 after:rounded-full after:bg-primary"
      />
    </RadioGroupPrimitive.Item>
  );
}

export type RadioGroupProps = ComponentProps<typeof RadioGroupPrimitive.Root> & {
  /** Convenience form: hand it options rather than composing items. */
  options?: RadioOption[];
  ariaLabel?: string;
};

export function RadioGroup({
  className,
  options,
  ariaLabel,
  orientation = "vertical",
  children,
  ...props
}: RadioGroupProps) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      aria-label={ariaLabel}
      orientation={orientation}
      className={cn(
        "grid gap-2",
        orientation === "horizontal" && "grid-flow-col justify-start gap-4",
        className,
      )}
      {...props}
    >
      {options
        ? options.map((option) => {
            const id = `${props.name ?? "radio"}-${option.value}`;
            return (
              <label
                key={option.value}
                htmlFor={id}
                className="flex min-h-6 cursor-pointer items-center gap-2 text-base text-subtle hover:text-foreground has-disabled:cursor-not-allowed has-disabled:opacity-50"
              >
                <RadioGroupItem id={id} value={option.value} disabled={option.disabled} />
                <span>{option.label}</span>
                {option.hint ? (
                  <span className="ml-auto font-mono text-sm tabular-nums text-muted-foreground">
                    {option.hint}
                  </span>
                ) : null}
              </label>
            );
          })
        : children}
    </RadioGroupPrimitive.Root>
  );
}
