import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../cn";

export type ButtonVariant = "primary" | "secondary" | "danger";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  full?: boolean;
  inline?: boolean;
  icon?: ReactNode;
};

export function buttonClass(variant: ButtonVariant = "primary", full = false, inline = false) {
  return cn(
    "button",
    variant === "secondary" && "secondary",
    variant === "danger" && "danger",
    full && "full",
    inline && "inline-button",
  );
}

export function Button({
  variant = "primary",
  full = false,
  inline = false,
  icon,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button type={type} className={cn(buttonClass(variant, full, inline), className)} {...rest}>
      {icon}
      {children}
    </button>
  );
}
