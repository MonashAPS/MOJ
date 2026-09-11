import type { ComponentProps } from "react";
import { cn } from "../cn";

export function Kbd({ className, ...props }: ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-xs border border-border-strong",
        "bg-secondary px-[5px] font-mono text-xs font-medium text-subtle",
        "shadow-[0_1px_0_var(--line-strong)]",
        className,
      )}
      {...props}
    />
  );
}

export function KbdGroup({ className, ...props }: ComponentProps<"span">) {
  return (
    <span data-slot="kbd-group" className={cn("inline-flex items-center gap-1", className)} {...props} />
  );
}
