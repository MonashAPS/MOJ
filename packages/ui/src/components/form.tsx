"use client";

import type * as LabelPrimitive from "@radix-ui/react-label";
import { Slot } from "@radix-ui/react-slot";
import type { ComponentProps, ReactNode } from "react";
import { createContext, useContext, useId } from "react";
import {
  Controller,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
  FormProvider,
  useFormContext,
  useFormState,
} from "react-hook-form";
import { cn } from "../cn";
import { Label } from "./label";

export const Form = FormProvider;

type FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = { name: TName };

const FormFieldContext = createContext<FormFieldContextValue>({} as FormFieldContextValue);
const FormItemContext = createContext<{ id: string }>({} as { id: string });

export function FormField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({ ...props }: ControllerProps<TFieldValues, TName>) {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
}

/** The wiring that makes `aria-describedby` and `aria-invalid` correct on every
 *  field for free; every `aria-invalid:` style in the kit depends on it. */
export function useFormField() {
  const fieldContext = useContext(FormFieldContext);
  const itemContext = useContext(FormItemContext);
  const { getFieldState } = useFormContext();
  const formState = useFormState({ name: fieldContext.name });
  const fieldState = getFieldState(fieldContext.name, formState);

  if (!fieldContext) throw new Error("useFormField should be used within <FormField>");

  return {
    id: itemContext.id,
    name: fieldContext.name,
    formItemId: `${itemContext.id}-form-item`,
    formDescriptionId: `${itemContext.id}-form-item-description`,
    formMessageId: `${itemContext.id}-form-item-message`,
    ...fieldState,
  };
}

export function FormItem({ className, ...props }: ComponentProps<"div">) {
  const id = useId();
  return (
    <FormItemContext.Provider value={{ id }}>
      <div data-slot="form-item" className={cn("grid gap-1", className)} {...props} />
    </FormItemContext.Provider>
  );
}

export function FormLabel({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
  const { error, formItemId } = useFormField();
  return (
    <Label
      data-slot="form-label"
      data-error={!!error}
      htmlFor={formItemId}
      className={cn("data-[error=true]:text-danger-ink", className)}
      {...props}
    />
  );
}

export function FormControl(props: ComponentProps<typeof Slot>) {
  const { error, formItemId, formDescriptionId, formMessageId } = useFormField();
  return (
    <Slot
      data-slot="form-control"
      id={formItemId}
      aria-describedby={error ? `${formDescriptionId} ${formMessageId}` : formDescriptionId}
      aria-invalid={!!error}
      {...props}
    />
  );
}

export function FormDescription({ className, ...props }: ComponentProps<"p">) {
  const { formDescriptionId } = useFormField();
  return (
    <p
      data-slot="form-description"
      id={formDescriptionId}
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export function FormMessage({ className, ...props }: ComponentProps<"p">) {
  const { error, formMessageId } = useFormField();
  const body = error ? String(error?.message ?? "") : props.children;
  if (!body) return null;
  return (
    <p
      data-slot="form-message"
      id={formMessageId}
      role="alert"
      className={cn("text-sm text-danger-ink", className)}
      {...props}
    >
      {body}
    </p>
  );
}

/** The uncontrolled sibling of FormItem, for forms that are not on react-hook-form.
 *  Label, control, then either a hint or, when there is one, the error. */
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
    <div data-slot="field" className={cn("grid gap-1", className)}>
      {label ? (
        <Label htmlFor={htmlFor}>
          {label}
          {optional ? <span className="font-normal text-muted-foreground">{optional}</span> : null}
        </Label>
      ) : null}
      {children}
      {error ? (
        <span className="text-sm text-danger-ink" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="text-sm text-muted-foreground">{hint}</span>
      ) : null}
    </div>
  );
}

/** Fields are --space-4 apart; a two-column form collapses to one under 720px. */
export function FieldGroup({
  className,
  columns = 1,
  ...props
}: ComponentProps<"div"> & { columns?: 1 | 2 }) {
  return (
    <div
      data-slot="field-group"
      className={cn("grid gap-4", columns === 2 && "sm:grid-cols-2", className)}
      {...props}
    />
  );
}

/** A --line rule, then the buttons right-aligned with the primary right-most. */
export function FormFooter({ className, note, children }: ComponentProps<"div"> & { note?: ReactNode }) {
  return (
    <div
      data-slot="form-footer"
      className={cn("mt-6 flex flex-wrap items-center gap-2 border-t border-border pt-4", className)}
    >
      {note ? <span className="text-sm text-muted-foreground">{note}</span> : null}
      <div className="ml-auto flex items-center gap-2">{children}</div>
    </div>
  );
}
