"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";

const STORAGE_KEY = "moj-home-top-dismissed";

function hashOf(value: string): string {
  let hash = 0;

  for (let index = 0; index < value.length; index++) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }

  return String(hash);
}

/** The `home_page_top` misc-config slot. Dismissal is remembered by content
 *  hash, so a new announcement shows again. */
export function HomeTopSlot({ html }: { html: string }) {
  const hash = hashOf(html);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(STORAGE_KEY) === hash);
    } catch {
      setDismissed(false);
    }
  }, [hash]);

  if (dismissed) return null;

  return (
    <div className="mb-6 flex items-start gap-3 rounded-md border border-primary-line border-l-[3px] border-l-royal bg-primary-soft px-4 py-3 text-base text-foreground transition-opacity">
      <div
        className="min-w-0 flex-1 [&_a]:text-link [&_a]:underline [&_h1]:text-h3 [&_h2]:text-h3 [&_p+p]:mt-2"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitised upstream by @moj/content's flatpage preset
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <button
        type="button"
        aria-label="Dismiss this announcement"
        title="Dismiss this announcement"
        onClick={() => {
          setDismissed(true);

          try {
            localStorage.setItem(STORAGE_KEY, hash);
          } catch {
            // private mode
          }
        }}
        className="-mr-1 flex size-6 shrink-0 items-center justify-center rounded-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  );
}
