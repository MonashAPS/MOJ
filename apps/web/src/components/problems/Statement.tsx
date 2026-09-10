"use client";

import { ContentDescription, cn } from "@moj/ui";
import { useEffect, useRef, useState } from "react";
import { STATEMENT_COPY_ICONS } from "@/lib/statement";

/**
 * The statement body. The markup is produced on the server (`decorateStatement`)
 * so nothing reflows after hydration; this component only wires the Copy buttons,
 * which announce through a polite live region and never raise a toast.
 */
export function Statement({ html, className }: { html: string; className?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const timers = new Set<ReturnType<typeof setTimeout>>();

    async function onClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      const button = target?.closest<HTMLButtonElement>("[data-statement-copy]");
      if (!button) return;
      const figure = button.closest("figure");
      const body = figure?.querySelector("[data-statement-code]");
      if (!body) return;

      try {
        await navigator.clipboard.writeText((body.textContent ?? "").replace(/\n$/, ""));
      } catch {
        setAnnouncement("Copying is not available in this browser.");
        return;
      }
      button.innerHTML = STATEMENT_COPY_ICONS.check;
      button.style.color = "var(--v-good)";
      setAnnouncement("Copied to clipboard.");
      const timer = setTimeout(() => {
        button.innerHTML = STATEMENT_COPY_ICONS.copy;
        button.style.removeProperty("color");
        timers.delete(timer);
      }, 1200);
      timers.add(timer);
    }

    node.addEventListener("click", onClick);
    return () => {
      node.removeEventListener("click", onClick);
      for (const timer of timers) clearTimeout(timer);
    };
  }, []);

  return (
    <div ref={root}>
      {/* DESIGN 14.2: the statement is the one place in MOJ that is prose, and it
          keeps the 74ch measure. `content.css` lives in @moj/content, which this
          branch does not own, so the cap is applied here. */}
      <ContentDescription
        html={html}
        className={cn(
          "max-w-(--prose-max)",
          // DESIGN 14.2 frames statement images; content.css is @moj/content's.
          "[&_img]:rounded-md [&_img]:border [&_img]:border-border [&_img]:bg-secondary",
          className,
        )}
      />
      <output aria-live="polite" className="sr-only">
        {announcement}
      </output>
    </div>
  );
}
