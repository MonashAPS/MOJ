"use client";

import { cn } from "@moj/ui";
import { Megaphone, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

const STORAGE_KEY = "moj-announcement-dismissed";

function hashOf(value: string): string {
  let hash = 0;

  for (let index = 0; index < value.length; index++) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }

  return String(hash);
}

/** DMOJ's misc-config announcement box, bottom right. Dismissal is remembered by
 *  content hash, so a new announcement shows again. */
export function Announcement({ html }: { html?: string }) {
  const t = useTranslations("common.announcement");
  const body = html?.trim() ?? "";
  const hash = body ? hashOf(body) : "";
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (!hash) return;

    try {
      setDismissed(localStorage.getItem(STORAGE_KEY) === hash);
    } catch {
      setDismissed(false);
    }
  }, [hash]);

  if (!body || dismissed) return null;

  return (
    <div
      role="status"
      className={cn(
        "fixed bottom-4 right-4 z-(--z-floater) flex max-w-[min(380px,calc(100vw-2rem))] items-start gap-2",
        "rounded-md border border-warning-line bg-warning-bg p-3 text-base text-warning-ink shadow-2",
      )}
    >
      <Megaphone size={16} aria-hidden className="mt-0.5 shrink-0" />
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: misc config, staff authored */}
      <span className="min-w-0 flex-1 [&_a]:underline" dangerouslySetInnerHTML={{ __html: body }} />
      <button
        type="button"
        aria-label={t("dismiss")}
        title={t("dismiss")}
        onClick={() => {
          setDismissed(true);

          try {
            localStorage.setItem(STORAGE_KEY, hash);
          } catch {
            // private mode
          }
        }}
        className="-mr-1 -mt-1 flex size-6 shrink-0 items-center justify-center rounded-xs transition-opacity hover:opacity-70"
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  );
}
