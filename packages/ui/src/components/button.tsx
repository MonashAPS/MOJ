"use client";

import { Slot, Slottable } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn";
import { controlIcons, disabledAction, focusRing } from "../styles";

export const buttonVariants = cva(
  cn(
    "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md",
    "font-sans text-base font-medium leading-none",
    "transition-[color,background-color,border-color,box-shadow]",
    "shadow-none select-none",
    controlIcons,
    disabledAction,
    focusRing,
  ),
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-active",
        secondary:
          "border border-border-strong bg-card text-foreground hover:bg-secondary hover:border-border-strong",
        outline: "border border-primary-line bg-transparent text-primary hover:bg-primary-soft",
        ghost: "bg-transparent text-subtle hover:bg-accent hover:text-foreground",
        danger: "bg-destructive text-destructive-foreground hover:brightness-[.92]",
        link: "h-auto p-0 text-link underline-offset-4 hover:underline",
        canary: "rounded-full bg-canary font-semibold text-nav hover:brightness-[.94]",
      },
      size: {
        default: "h-(--control-h) px-4",
        sm: "h-(--control-h-sm) px-3 text-sm",
        lg: "h-9 px-5",
        icon: "size-(--control-h) p-0",
        "icon-sm": "size-(--control-h-sm) p-0",
        pill: "h-(--control-h-sm) rounded-full px-4 text-sm",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
);

export type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>;

export type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>["size"]>;

export type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    /** Stretch to the width of the form column. */
    full?: boolean;
    /** DMOJ's inline button: the dense variant that sits inside a table row. */
    inline?: boolean;
    /** Leading node, replaced by a spinner while `busy`. */
    icon?: ReactNode;
    /** Keeps the label and the width, swaps the icon, stops taking pointers. */
    busy?: boolean;
  };

export function buttonClass(variant: ButtonVariant = "primary", full = false, inline = false) {
  return cn(buttonVariants({ variant, size: inline ? "sm" : "default" }), full && "w-full");
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  full = false,
  inline = false,
  icon,
  busy = false,
  type = "button",
  children,
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot : "button";
  const leading = busy ? <Loader2 className="animate-spin-slow" aria-hidden /> : icon;

  return (
    <Component
      data-slot="button"
      type={asChild ? undefined : type}
      aria-busy={busy || undefined}
      className={cn(
        buttonVariants({ variant, size: size ?? (inline ? "sm" : "default") }),
        full && "w-full",
        busy && "pointer-events-none",
        className,
      )}
      {...props}
    >
      {leading}
      <Slottable>{children}</Slottable>
    </Component>
  );
}
