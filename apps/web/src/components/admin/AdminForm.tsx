"use client";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Checkbox,
  cn,
  FieldGroup,
  FormFooter,
  Panel,
} from "@moj/ui";
import { CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { type FormEvent, type ReactNode, useEffect, useId } from "react";

/**
 * A console form: sections stacked, then the footer.
 *
 * A page that lays out its own footer passes only `children` and `onSubmit`.
 * `managed` makes the form draw the footer and the saved and error alerts,
 * which is what most of the console's editors want.
 *
 * There is no reason field. Every edit used to demand a sentence explaining
 * itself, which is a toll on the common case — fixing a typo — in exchange for
 * a history nobody reads. Revisions still record who changed what and when;
 * they just no longer ask why.
 */
export function AdminForm({
  onSubmit,
  children,
  className,
  managed = false,
  dirty = false,
  busy = false,
  busyLabel,
  submitLabel,
  error,
  saved,
  actions,
}: {
  onSubmit: () => void | Promise<void>;
  children: ReactNode;
  className?: string;
  /** Draw the saved and error alerts and the footer, not only the fields. */
  managed?: boolean;
  dirty?: boolean;
  busy?: boolean;
  busyLabel?: string;
  submitLabel?: string;
  error?: string | null;
  saved?: string | null;
  actions?: ReactNode;
}) {
  useEffect(() => {
    if (!dirty) return;

    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
    }

    window.addEventListener("beforeunload", warn);

    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onSubmit();
  }

  if (!managed) {
    return (
      <form noValidate onSubmit={handleSubmit} className={cn("grid gap-4", className)}>
        {children}
      </form>
    );
  }

  return (
    <form noValidate onSubmit={handleSubmit} className={className}>
      {saved ? (
        <Alert variant="success" className="mb-4">
          <CheckCircle2 className="size-3.5" aria-hidden />
          <AlertTitle>{saved}</AlertTitle>
        </Alert>
      ) : null}
      <AdminFormError message={error ?? null} />

      <div className="grid gap-4">{children}</div>

      <AdminFormFooter
        dirty={dirty}
        busy={busy}
        busyLabel={busyLabel}
        submitLabel={submitLabel}
        secondary={actions}
      />
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
export function AdminFormFooter({
  dirty,
  busy,
  submitLabel,
  busyLabel,
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
  const t = useTranslations("admin.components.form");

  return (
    // Pinned to the bottom of the window rather than the bottom of the form.
    // A console page is long and the thing you came to press was under all of
    // it; scrolling to save is a tax on every edit. The negative margins undo
    // the page column's gutter so the bar runs the full width of the content,
    // and the background is opaque so the form scrolls behind rather than
    // through it.
    <FormFooter
      note={note ?? (dirty ? t("unsaved") : undefined)}
      className="sticky bottom-0 z-(--z-sticky) -mx-(--gutter) mt-6 border-t border-border bg-background/95 px-(--gutter) py-3 backdrop-blur-sm"
    >
      {secondary}
      <Button type="submit" busy={busy}>
        {busy ? (busyLabel ?? t("busy")) : (submitLabel ?? t("submit"))}
      </Button>
    </FormFooter>
  );
}

/** What a mutation said when it refused, on the page rather than in a toast. */
export function AdminFormError({ message }: { message: string | null }) {
  const t = useTranslations("admin.components.form");

  if (!message) return null;

  return (
    <Alert variant="danger">
      <AlertTitle>{t("errorTitle")}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
