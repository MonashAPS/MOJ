"use client";

import { Dialog, DialogContent } from "@moj/ui";
import type { ReactNode } from "react";
import { AdminForm } from "./AdminForm";

/**
 * The console's create-and-edit surface for the small tables: a dialog holding
 * an `AdminForm`, so the footer is the same everywhere.
 */
export function RecordDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  onSubmit,
  busy,
  error,
  submitLabel,
  width = 620,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  onSubmit: () => void | Promise<void>;
  busy: boolean;
  error: string | null;
  submitLabel: string;
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
        <AdminForm onSubmit={onSubmit} managed busy={busy} error={error} submitLabel={submitLabel}>
          {children}
        </AdminForm>
      </DialogContent>
    </Dialog>
  );
}
