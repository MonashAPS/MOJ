"use client";

import { Button, cn } from "@moj/ui";
import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Copy is an inline check on the button, not a toast: the user is looking at
 * the thing they just copied (DESIGN.md section 20.3). The result is announced
 * through a polite live region for anyone who is not.
 */
export function CopyButton({
  text,
  label = "Copy",
  className,
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1200);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className={cn(className)}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
        icon={copied ? <Check aria-hidden className="text-good" /> : <Copy aria-hidden />}
      >
        {copied ? "Copied" : label}
      </Button>
      <span aria-live="polite" className="sr-only">
        {copied ? "Copied to clipboard" : ""}
      </span>
    </>
  );
}
