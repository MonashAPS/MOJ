"use client";

import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn";
import { disabledField, focusRing } from "../styles";

export type RadioOption = {
  value: string;
  label: ReactNode;
  disabled?: boolean;
  /** A short note beside the label, right-aligned. */
  hint?: ReactNode;
  /** A sentence under the label saying what choosing this does. Cards only. */
  description?: ReactNode;
};

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
  /**
   * `card` gives each option a bordered box with room for a sentence under the
   * label, for a choice whose consequences are the point rather than its name.
   */
  variant?: "plain" | "card";
};

export function RadioGroup({
  className,
  options,
  ariaLabel,
  orientation = "vertical",
  variant = "plain",
  children,
  ...props
}: RadioGroupProps) {
  const card = variant === "card";

  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      aria-label={ariaLabel}
      orientation={orientation}
      className={cn(
        "grid gap-2",
        orientation === "horizontal" && !card && "grid-flow-col justify-start gap-4",
        card && "gap-3",
        className,
      )}
      {...props}
    >
      {options
        ? options.map((option) => {
            const id = `${props.name ?? "radio"}-${option.value}`;

            if (card) {
              return (
                <label
                  key={option.value}
                  htmlFor={id}
                  className={cn(
                    "grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-1",
                    "rounded-md border border-border bg-card p-3 transition-colors",
                    "hover:border-input has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-row-selected",
                    "has-disabled:cursor-not-allowed has-disabled:opacity-50",
                  )}
                >
                  <RadioGroupItem
                    id={id}
                    value={option.value}
                    disabled={option.disabled}
                    className="mt-0.5"
                  />
                  <span className="text-base font-medium text-foreground">{option.label}</span>
                  {option.description ? (
                    <span className="col-start-2 text-sm text-muted-foreground">{option.description}</span>
                  ) : null}
                </label>
              );
            }

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
