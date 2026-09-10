import type { HTMLAttributes } from "react";
import { cn } from "../cn";

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  accent?: boolean;
};

export function Badge({ accent = false, className, children, ...rest }: BadgeProps) {
  return (
    <span className={cn("badge", accent && "accent", className)} {...rest}>
      {children}
    </span>
  );
}
