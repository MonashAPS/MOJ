"use client";

import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn";
import { disabledField, focusRing } from "../styles";

export const inputClass = cn(
  "flex h-(--control-h) w-full min-w-0 rounded-md border border-input bg-background px-3",
  "font-sans text-[16px] leading-none text-foreground md:text-base",
  "placeholder:text-muted-foreground shadow-none",
  "transition-[color,border-color,box-shadow]",
  "file:h-full file:border-0 file:bg-transparent file:text-sm file:font-medium",
  disabledField,
  focusRing,
);

export type InputProps = ComponentProps<"input"> & {
  invalid?: boolean;
  /** Leading glyph. Renders the field as an input group. */
  icon?: ReactNode;
  /** Trailing node: a Kbd hint, a clear button. */
  trailing?: ReactNode;
  /** Numbers, codes, limits: mono and tabular. */
  mono?: boolean;
};

export function Input({ invalid, icon, trailing, mono, className, ...props }: InputProps) {
  const field = (
    <input
      data-slot="input"
      aria-invalid={invalid || props["aria-invalid"]}
      className={cn(
        icon || trailing ? "h-full w-full min-w-0 border-0 bg-transparent p-0 outline-none" : inputClass,
        icon || trailing
          ? "font-sans text-[16px] text-foreground placeholder:text-muted-foreground md:text-base"
          : null,
        mono && "font-mono text-mono tabular-nums",
        !icon && !trailing && className,
      )}
      {...props}
    />
  );
  if (!icon && !trailing) return field;
  return (
    <div
      data-slot="input-group"
      aria-invalid={invalid || undefined}
      className={cn(
        inputClass,
        "items-center gap-2 focus-within:border-royal focus-within:ring-[3px] focus-within:ring-royal/45",
        invalid && "border-bad ring-[3px] ring-bad/25",
        className,
      )}
    >
      {icon ? <span className="flex shrink-0 items-center text-muted-foreground">{icon}</span> : null}
      {field}
      {trailing ? <span className="flex shrink-0 items-center">{trailing}</span> : null}
    </div>
  );
}

export type TextareaProps = ComponentProps<"textarea"> & { invalid?: boolean; mono?: boolean };

export function Textarea({ invalid, mono, className, ...props }: TextareaProps) {
  return (
    <textarea
      data-slot="textarea"
      aria-invalid={invalid || props["aria-invalid"]}
      className={cn(
        "field-sizing-content flex min-h-24 w-full resize-y rounded-md border border-input bg-background",
        "px-3 py-2 font-sans text-[16px] leading-(--lh) text-foreground md:text-base",
        "placeholder:text-muted-foreground shadow-none transition-[color,border-color,box-shadow]",
        mono && "font-mono text-mono",
        disabledField,
        focusRing,
        className,
      )}
      {...props}
    />
  );
}
