"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../cn";

export const DialogRoot = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;

export function DialogContent({
  title,
  description,
  children,
  className,
  showClose = true,
  width = 520,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  showClose?: boolean;
  width?: number;
}) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0, 0, 0, 0.45)",
          zIndex: 1000,
        }}
      />
      <RadixDialog.Content
        className={cn(className)}
        style={{
          position: "fixed",
          top: "12vh",
          left: "50%",
          transform: "translateX(-50%)",
          width: `min(${width}px, calc(100vw - 24px))`,
          background: "var(--bg)",
          color: "var(--ink)",
          border: "1px solid var(--line)",
          borderRadius: "var(--radius)",
          boxShadow: `0 10px 40px var(--shadow)`,
          zIndex: 1001,
          maxHeight: "76vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 12px",
            borderBottom: "1px solid var(--line)",
          }}
        >
          <RadixDialog.Title
            style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "1.1em" }}
          >
            {title}
          </RadixDialog.Title>
          {showClose ? (
            <RadixDialog.Close
              aria-label="Close"
              style={{
                marginLeft: "auto",
                background: "none",
                border: 0,
                color: "var(--muted)",
                cursor: "pointer",
                display: "flex",
              }}
            >
              <X size={16} />
            </RadixDialog.Close>
          ) : null}
        </div>
        {description ? (
          <RadixDialog.Description style={{ padding: "8px 12px 0", color: "var(--ink-2)" }}>
            {description}
          </RadixDialog.Description>
        ) : (
          <RadixDialog.Description style={{ display: "none" }} />
        )}
        <div style={{ padding: 12, overflowY: "auto" }}>{children}</div>
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}
