"use client";

import { Dialog, DialogContent } from "@moj/ui";
import type { ReactNode } from "react";
import { AdminForm } from "@/components/admin/AdminForm";

/**
 * The console's create-and-edit surface for the small tables: a dialog holding
 * an `AdminForm`, so the reason field and the footer are the same everywhere.
 */
export function RecordDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  onSubmit,
  reason,
  onReasonChange,
  busy,
  error,
  submitLabel,
  reasonLabel,
  reasonHint,
  width = 620,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  onSubmit: () => void | Promise<void>;
  reason: string;
  onReasonChange: (value: string) => void;
  busy: boolean;
  error: string | null;
  submitLabel: string;
  reasonLabel?: string;
  reasonHint?: string;
  width?: number;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={title}
        description={description}
        width={width}
        className="max-h-[86dvh] overflow-y-auto"
      >
        <AdminForm
          onSubmit={onSubmit}
          reason={reason}
          onReasonChange={onReasonChange}
          {...(reasonLabel ? { reasonLabel } : {})}
          {...(reasonHint ? { reasonHint } : {})}
          busy={busy}
          error={error}
          submitLabel={submitLabel}
        >
          {children}
        </AdminForm>
      </DialogContent>
    </Dialog>
  );
}
