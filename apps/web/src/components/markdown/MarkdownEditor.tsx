"use client";

import { cn, Textarea } from "@moj/ui";

/**
 * Placeholder. The community wave owns the real editor (a toolbar, a preview
 * pane and the `@moj/content` preset the field is rendered with); this keeps
 * the same props so the staff console does not have to change when it lands.
 */
export type MarkdownEditorProps = {
  value: string;
  onChange: (value: string) => void;
  /** The `@moj/content` preset the text is rendered with. */
  preset?: string;
  id?: string;
  name?: string;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  ariaLabel?: string;
};

export function MarkdownEditor({
  value,
  onChange,
  preset,
  id,
  name,
  placeholder,
  rows = 14,
  disabled,
  invalid,
  className,
  ariaLabel,
}: MarkdownEditorProps) {
  return (
    <Textarea
      id={id}
      name={name}
      rows={rows}
      mono
      value={value}
      disabled={disabled}
      invalid={invalid}
      placeholder={placeholder}
      aria-label={ariaLabel}
      data-preset={preset}
      onChange={(event) => onChange(event.target.value)}
      className={cn("min-h-[220px] leading-relaxed", className)}
    />
  );
}

export default MarkdownEditor;
