"use client";

import { AlertCircle, CheckCircle2, Info, Loader2, TriangleAlert } from "lucide-react";
import { Toaster as Sonner, type ToasterProps, toast } from "sonner";

/** Toasts are for things that happened elsewhere or asynchronously. A copy button
 *  shows an inline check; a form error belongs on the field. */
export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      className="toaster group"
      position="bottom-right"
      richColors={false}
      closeButton
      duration={5000}
      visibleToasts={3}
      icons={{
        success: <CheckCircle2 className="size-4 text-good" />,
        error: <AlertCircle className="size-4 text-bad" />,
        warning: <TriangleAlert className="size-4 text-warn" />,
        info: <Info className="size-4 text-run" />,
        loading: <Loader2 className="size-4 animate-spin-slow text-run" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            "!bg-card !text-foreground !border !border-border !rounded-md !shadow-2 !font-sans !text-base !gap-3",
          description: "!text-muted-foreground !text-sm",
          actionButton: "!bg-primary !text-primary-foreground !rounded-md !text-sm",
          cancelButton: "!bg-secondary !text-subtle !rounded-md !text-sm",
          success: "!border-l-[3px] !border-l-good",
          error: "!border-l-[3px] !border-l-bad",
          warning: "!border-l-[3px] !border-l-warn",
          info: "!border-l-[3px] !border-l-run",
        },
      }}
      style={{ zIndex: "var(--z-toast)" } as React.CSSProperties}
      {...props}
    />
  );
}

export { toast };
