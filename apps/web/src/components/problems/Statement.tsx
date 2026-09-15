"use client";

import { ContentDescription, cn } from "@moj/ui";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { STATEMENT_COPY_ICONS } from "@/lib/statement";

/**
 * The statement body. The markup is produced on the server (`decorateStatement`)
 * so nothing reflows after hydration; this component only wires the titlebar
 * buttons. Copy announces through a polite live region and never raises a toast.
 *
 * Expand is offered only where there is something to expand, which is a rendered
 * height and so has to be measured here.
 */
export function Statement({ html, className }: { html: string; className?: string }) {
  const t = useTranslations("problems.statement");
  const root = useRef<HTMLDivElement>(null);
  const [announcement, setAnnouncement] = useState("");

  // Whether a sample overflows its cap is a rendered height, so the offer to
  // expand can only be made once this markup is on the page.
  useEffect(() => {
    const node = root.current;

    if (!node || !html) return;

    for (const body of node.querySelectorAll<HTMLElement>("[data-statement-code]")) {
      const toggle = body.closest("figure")?.querySelector<HTMLElement>("[data-statement-expand]");

      if (toggle && body.scrollHeight > body.clientHeight + 1) toggle.style.display = "inline-flex";
    }
  }, [html]);

  useEffect(() => {
    const node = root.current;

    if (!node) return;
    const timers = new Set<ReturnType<typeof setTimeout>>();

    async function onClick(event: MouseEvent) {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const toggle = target?.closest<HTMLButtonElement>("[data-statement-expand]");

      if (toggle) {
        const body = toggle.closest("figure")?.querySelector<HTMLElement>("[data-statement-code]");

        if (!body) return;
        const open = body.dataset.expanded === "true";
        body.dataset.expanded = open ? "false" : "true";
        // Off the cap entirely, so a long sample scrolls with the page rather
        // than trapping the wheel in a box.
        body.style.maxHeight = open ? "" : "none";
        body.style.overflow = open ? "" : "visible";
        toggle.innerHTML = open ? STATEMENT_COPY_ICONS.expand : STATEMENT_COPY_ICONS.collapse;
        const name = open ? t("expand") : t("collapse");
        toggle.setAttribute("aria-label", name);
        toggle.setAttribute("title", name);

        return;
      }

      const button = target?.closest<HTMLButtonElement>("[data-statement-copy]");

      if (!button) return;
      const figure = button.closest("figure");
      const body = figure?.querySelector("[data-statement-code]");

      if (!body) return;

      try {
        await navigator.clipboard.writeText((body.textContent ?? "").replace(/\n$/, ""));
      } catch {
        setAnnouncement(t("copyUnavailable"));

        return;
      }

      button.innerHTML = STATEMENT_COPY_ICONS.check;
      button.style.color = "var(--v-good)";
      setAnnouncement(t("copied"));

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
  }, [t]);

  return (
    <div ref={root}>
      {/* The statement fills its column, as DMOJ's does. */}
      <ContentDescription
        html={html}
        className={cn(
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
