"use client";

import * as TogglePrimitive from "@radix-ui/react-toggle";
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import type { ComponentProps } from "react";
import { cn } from "../cn";
import { disabledAction, focusRing } from "../styles";

const toggleBase = cn(
  "inline-flex h-(--control-h-sm) items-center justify-center gap-1.5 whitespace-nowrap rounded-sm px-2",
  "font-sans text-sm font-medium text-subtle transition-[color,background-color]",
  "hover:bg-accent hover:text-foreground",
  "data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-1",
  "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  disabledAction,
  focusRing,
);

/** The pressed-state button. Not to be confused with `Toggle`, which is a Switch. */
export function ToggleButton({ className, ...props }: ComponentProps<typeof TogglePrimitive.Root>) {
  return <TogglePrimitive.Root data-slot="toggle" className={cn(toggleBase, className)} {...props} />;
}

/** The three-way theme control in the user dropdown is one of these. */
export function ToggleGroup({ className, ...props }: ComponentProps<typeof ToggleGroupPrimitive.Root>) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      className={cn("inline-flex w-full items-center gap-0.5 rounded-md bg-secondary p-[3px]", className)}
      {...props}
    />
  );
}

export function ToggleGroupItem({ className, ...props }: ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      className={cn(toggleBase, "min-w-0 flex-1", className)}
      {...props}
    />
  );
}
