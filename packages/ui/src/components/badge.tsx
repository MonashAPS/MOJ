import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "../cn";
import { focusRing } from "../styles";

export const badgeVariants = cva(
  cn(
    "inline-flex w-fit shrink-0 items-center justify-center gap-1 whitespace-nowrap",
    "border border-transparent transition-[color,background-color,border-color]",
    "[&>svg]:pointer-events-none [&>svg]:size-3",
    focusRing,
  ),
  {
    variants: {
      variant: {
        neutral: "bg-neutral-bg text-neutral",
        accent: "bg-primary-soft text-primary border-primary-line",
        primary: "bg-primary text-primary-foreground",
        outline: "border-border-strong bg-transparent text-subtle",
        good: "bg-good-bg text-good",
        bad: "bg-bad-bg text-bad",
        warn: "bg-warn-bg text-warn",
        run: "bg-run-bg text-run",
        ie: "bg-bad-bg text-ie border-dashed border-ie",
      },
      shape: {
        /** Values: a verdict, a tag, a contest problem letter. */
        pill: "rounded-full px-2",
        /** Dense rows: the verdict code inside a submission list. */
        square: "rounded-xs px-1.5",
      },
      size: {
        default: "h-[18px] text-xs font-medium",
        lg: "h-6 px-2.5 text-sm font-medium",
      },
      mono: {
        true: "font-mono uppercase tracking-[.02em] tabular-nums",
        false: "font-sans",
      },
    },
    defaultVariants: { variant: "neutral", shape: "pill", size: "default", mono: false },
  },
);

export type BadgeProps = ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & {
    asChild?: boolean;
    /** The foundation's flag for the accent variant. */
    accent?: boolean;
  };

export function Badge({ className, variant, shape, size, mono, asChild, accent, ...props }: BadgeProps) {
  const Component = asChild ? Slot : "span";
  return (
    <Component
      data-slot="badge"
      className={cn(
        badgeVariants({ variant: accent ? "accent" : variant, shape, size, mono }),
        "[a&]:transition-colors [a&]:hover:brightness-95",
        className,
      )}
      {...props}
    />
  );
}
