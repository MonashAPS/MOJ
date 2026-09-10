"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Badge,
  Button,
  cn,
  InputGroup,
  InputGroupInput,
  Tooltip,
} from "@moj/ui";
import { Check, Copy, Search } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

/** Every missing value in the console is an em-dash. */
export const DASH = "—";

export function SearchBox({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <InputGroup
      className={cn("h-(--control-h-sm) w-[240px]", className)}
      leading={<Search className="size-3.5" aria-hidden />}
    >
      <InputGroupInput
        type="search"
        value={value}
        aria-label={ariaLabel}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </InputGroup>
  );
}

/** Nothing irreversible happens without naming the object first. */
export function ConfirmAction({
  trigger,
  title,
  description,
  confirmLabel,
  onConfirm,
}: {
  trigger: ReactNode;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      await onConfirm();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="secondary" type="button">
              Cancel
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              void run();
            }}
          >
            {busy ? "Working…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** A yes/no chip that never relies on colour alone. Off renders nothing, so a
 *  row of flags shows one em-dash rather than one per flag. */
export function Flag({
  on,
  label,
  tone = "accent",
}: {
  on: boolean;
  label: string;
  tone?: "accent" | "bad" | "warn" | "good";
}) {
  if (!on) return null;
  return (
    <Badge variant={tone} shape="square">
      {label}
    </Badge>
  );
}

/** The flags cell: whatever is on, or one em-dash when nothing is. */
export function Flags({
  flags,
}: {
  flags: Array<{ on: boolean; label: string; tone?: "accent" | "bad" | "warn" | "good" }>;
}) {
  const on = flags.filter((flag) => flag.on);
  if (on.length === 0) return <span className="text-muted-foreground">{DASH}</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {on.map((flag) => (
        <Badge key={flag.label} variant={flag.tone ?? "accent"} shape="square">
          {flag.label}
        </Badge>
      ))}
    </span>
  );
}

/** Copy shows an inline check, never a toast (DESIGN.md section 20.3). */
export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <Tooltip content={copied ? "Copied" : label}>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        aria-label={label}
        icon={copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        onClick={() => {
          void navigator.clipboard.writeText(value).then(() => setCopied(true));
        }}
      >
        {copied ? "Copied" : label}
      </Button>
    </Tooltip>
  );
}

/** The console's status line: one sentence, never a toast for a local action. */
export function StatusLine({ tone, children }: { tone: "ok" | "bad"; children: ReactNode }) {
  if (!children) return null;
  return (
    <p className={cn("text-sm", tone === "ok" ? "text-success-ink" : "text-danger-ink")} role="status">
      {children}
    </p>
  );
}
