"use client";

import * as LabelPrimitive from "@radix-ui/react-label";
import type { ComponentProps } from "react";
import { cn } from "../cn";

/** Sentence case, 12.5px, 600. Required fields are never starred; an optional
 *  field says so at the end of its own label. */
export function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "flex select-none items-center gap-2 font-sans text-sm font-semibold leading-none text-subtle",
        "group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50",
        "peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

/** The one small-caps device in the product: 11px / 600 / 0.12em uppercase. */
export function MicroLabel({
  className,
  rail = false,
  tight = false,
  onDark = false,
  ...props
}: ComponentProps<"span"> & { rail?: boolean; tight?: boolean; onDark?: boolean }) {
  return (
    <span
      data-slot="micro-label"
      className={cn(
        "font-sans text-xs font-semibold uppercase tracking-label text-subtle",
        rail && "[writing-mode:vertical-rl] tracking-rail",
        tight && "tracking-[0.08em]",
        onDark && "text-contest-bar-ink",
        className,
      )}
      {...props}
    />
  );
}
