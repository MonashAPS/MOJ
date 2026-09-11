"use client";

import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn";
import { disabledField, focusRing } from "../styles";

/** A field with slots either side: the problem-list search box is this plus a
 *  leading `search` glyph and a trailing `Kbd`. */
export function InputGroup({
  className,
  leading,
  trailing,
  children,
  invalid,
  ...props
}: ComponentProps<"div"> & { leading?: ReactNode; trailing?: ReactNode; invalid?: boolean }) {
  return (
    <div
      data-slot="input-group"
      aria-invalid={invalid || undefined}
      className={cn(
        "flex h-(--control-h) w-full min-w-0 items-center gap-2 rounded-md border border-input bg-background px-3",
        "transition-[color,border-color,box-shadow]",
        "focus-within:border-royal focus-within:ring-[3px] focus-within:ring-royal/45",
        invalid && "border-bad ring-[3px] ring-bad/25",
        disabledField,
        className,
      )}
      {...props}
    >
      {leading ? <span className="flex shrink-0 items-center text-muted-foreground">{leading}</span> : null}
      {children}
      {trailing ? <span className="flex shrink-0 items-center">{trailing}</span> : null}
    </div>
  );
}

export function InputGroupInput({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      data-slot="input-group-input"
      className={cn(
        "h-full w-full min-w-0 border-0 bg-transparent p-0 font-sans text-[16px] text-foreground outline-none md:text-base",
        "placeholder:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { focusRing as inputGroupFocusRing };
