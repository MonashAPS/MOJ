import type { ReactNode } from "react";
import { cn } from "../cn";

export function Field({
  label,
  htmlFor,
  hint,
  error,
  optional,
  className,
  children,
}: {
  label?: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("field", className)}>
      {label ? (
        <label className="field-label" htmlFor={htmlFor}>
          {label}
          {optional ? <span className="optional">{optional}</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <span className="field-error" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="field-hint">{hint}</span>
      ) : null}
    </div>
  );
}
