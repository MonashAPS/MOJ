"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn";
import { focusRing } from "../styles";
import { useUiText } from "../ui-text";

export const DialogRoot = (props: ComponentProps<typeof DialogPrimitive.Root>) => (
  <DialogPrimitive.Root data-slot="dialog" {...props} />
);
export const Dialog = DialogRoot;

export const DialogTrigger = (props: ComponentProps<typeof DialogPrimitive.Trigger>) => (
  <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
);

export const DialogPortal = (props: ComponentProps<typeof DialogPrimitive.Portal>) => (
  <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
);

export const DialogClose = (props: ComponentProps<typeof DialogPrimitive.Close>) => (
  <DialogPrimitive.Close data-slot="dialog-close" {...props} />
);

export function DialogOverlay({ className, ...props }: ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-(--z-overlay) bg-[color-mix(in_srgb,var(--brand-navy)_70%,black)]/55 backdrop-blur-[2px]",
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
        className,
      )}
      {...props}
    />
  );
}

export type DialogContentProps = ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean;
  /** Convenience header. Compose DialogHeader yourself for anything richer. */
  title?: ReactNode;
  description?: ReactNode;
  width?: number;
};

export function DialogContent({
  className,
  children,
  showCloseButton = true,
  title,
  description,
  width,
  ...props
}: DialogContentProps) {
  const ui = useUiText();
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        style={width ? { maxWidth: `min(${width}px, calc(100vw - 32px))` } : undefined}
        className={cn(
          "fixed left-1/2 top-1/2 z-(--z-dialog) grid w-[calc(100vw-2rem)] max-w-[520px] -translate-x-1/2 -translate-y-1/2 gap-4",
          "rounded-lg border border-border bg-card p-6 text-foreground shadow-3",
          "duration-(--dur-slow) ease-house",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
          "data-[state=open]:zoom-in-[.98] data-[state=closed]:zoom-out-[.98] data-[state=open]:slide-in-from-bottom-1",
          className,
        )}
        {...props}
      >
        {title ? (
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
        ) : null}
        {children}
        {showCloseButton ? (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            aria-label={ui.close}
            className={cn(
              "absolute right-4 top-4 flex size-6 items-center justify-center rounded-sm text-muted-foreground",
              "transition-colors hover:bg-accent hover:text-foreground",
              focusRing,
            )}
          >
            <X className="size-4" aria-hidden />
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

export function DialogHeader({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="dialog-header" className={cn("grid gap-1", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  );
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("font-display text-h3 font-semibold text-foreground", className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}
