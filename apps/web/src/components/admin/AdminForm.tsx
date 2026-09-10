"use client";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Checkbox,
  cn,
  Field,
  FieldGroup,
  FormFooter,
  Input,
  Panel,
} from "@moj/ui";
import { type FormEvent, type ReactNode, useId } from "react";

/** A console form: sections stacked, then the reason field, then the footer. */
export function AdminForm({
  onSubmit,
  children,
  className,
}: {
  onSubmit: () => void;
  children: ReactNode;
  className?: string;
}) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }
  return (
    <form noValidate onSubmit={handleSubmit} className={cn("grid gap-4", className)}>
      {children}
    </form>
  );
}

/** A titled group of fields. One or two columns, collapsing under 640px. */
export function AdminSection({
  title,
  description,
  columns = 2,
  action,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  columns?: 1 | 2;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Panel
      title={title}
      action={action ? <span className="text-titlebar-ink">{action}</span> : null}
      className={className}
      bodyClassName="p-4"
    >
      {description ? <p className="mb-4 text-sm text-muted-foreground">{description}</p> : null}
      <FieldGroup columns={columns}>{children}</FieldGroup>
    </Panel>
  );
}

/** A field that spans both columns of an `AdminSection`. */
export function AdminWideField({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("sm:col-span-2", className)}>{children}</div>;
}

/** A checkbox with its own hint, laid out like the other fields. */
export function AdminCheckField({
  label,
  hint,
  checked,
  onCheckedChange,
  disabled,
  disabledReason,
}: {
  label: string;
  hint?: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const id = useId();
  return (
    <div className="grid gap-1" title={disabled ? disabledReason : undefined}>
      <Checkbox
        id={id}
        label={label}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
      {hint ? <span className="pl-6 text-sm text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

/**
 * SPEC section 8: every edit form ends with the reason the revision records.
 * It sits directly above the footer and is never optional.
 */
export function ReasonField({
  value,
  onChange,
  error,
  entity = "change",
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  entity?: string;
}) {
  const id = useId();
  return (
    <Panel title="History" bodyClassName="p-4">
      <Field
        label="Reason for change"
        htmlFor={id}
        error={error}
        hint={`Kept with the revision so the next person can see why this ${entity} moved.`}
      >
        <Input
          id={id}
          value={value}
          invalid={!!error}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Describe the change"
        />
      </Field>
    </Panel>
  );
}

/** The rule, the unsaved-changes note, then the buttons, primary right-most. */
export function AdminFormFooter({
  dirty,
  busy,
  submitLabel = "Save",
  busyLabel = "Saving…",
  secondary,
  note,
}: {
  dirty?: boolean;
  busy?: boolean;
  submitLabel?: string;
  busyLabel?: string;
  secondary?: ReactNode;
  note?: ReactNode;
}) {
  return (
    <FormFooter note={note ?? (dirty ? "Unsaved changes" : undefined)}>
      {secondary}
      <Button type="submit" busy={busy}>
        {busy ? busyLabel : submitLabel}
      </Button>
    </FormFooter>
  );
}

/** What a mutation said when it refused, on the page rather than in a toast. */
export function AdminFormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Alert variant="danger">
      <AlertTitle>The change was not saved</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
