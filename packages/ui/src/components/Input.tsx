import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { cn } from "../cn";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
  icon?: ReactNode;
};

export function Input({ invalid, icon, className, ...rest }: InputProps) {
  if (!icon) {
    return <input className={cn("control", invalid && "invalid", className)} {...rest} />;
  }
  return (
    <span className={cn("control", invalid && "invalid", className)}>
      <span className="control-icon">{icon}</span>
      <input className="control-input" {...rest} />
    </span>
  );
}

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean };

export function Textarea({ invalid, className, ...rest }: TextareaProps) {
  return <textarea className={cn("control", invalid && "invalid", className)} {...rest} />;
}
