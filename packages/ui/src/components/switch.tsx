"use client";

import * as SwitchPrimitive from "@radix-ui/react-switch";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn";
import { disabledField, focusRing } from "../styles";

export type SwitchProps = ComponentProps<typeof SwitchPrimitive.Root> & {
  label?: ReactNode;
};

/** Instant, reversible settings only: dark mode, "show my real name". Anything
 *  that needs a Save is a Checkbox. */
export function Switch({ className, label, ...props }: SwitchProps) {
  const control = (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-[18px] w-8 shrink-0 items-center rounded-full border border-transparent",
        "bg-well transition-[background-color,box-shadow] data-[state=checked]:bg-primary",
        disabledField,
        focusRing,
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block size-3.5 rounded-full bg-white shadow-1 ring-0",
          // The track is 32px wide with a 1px border, so the thumb travels between 2px and
          // 30px - 14px - 2px = 14px, leaving the same 2px either end.
          "transition-transform data-[state=unchecked]:translate-x-0.5 data-[state=checked]:translate-x-[14px]",
        )}
      />
    </SwitchPrimitive.Root>
  );
  if (!label) return control;
  return (
    <label
      htmlFor={props.id}
      className="flex min-h-6 cursor-pointer items-center gap-2 text-base text-subtle hover:text-foreground has-disabled:cursor-not-allowed has-disabled:opacity-50"
    >
      {control}
      <span>{label}</span>
    </label>
  );
}

/** The foundation's name for a labelled switch. */
export const Toggle = Switch;
