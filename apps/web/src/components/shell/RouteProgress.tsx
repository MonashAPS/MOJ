"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

const DELAY_MS = 120;

/** DESIGN.md section 20.2: a 2px royal bar at the top of the content column,
 *  appearing only after 120ms so a fast navigation never flashes it. There is no
 *  global router event in the App Router, so this watches internal anchor clicks
 *  and history moves and clears itself when the path lands. */
export function RouteProgress() {
  const t = useTranslations("common.states");
  const pathname = usePathname();
  const [pending, setPending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const start = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setPending(true), DELAY_MS);
    };

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) {
        return;
      }

      const anchor = event.target instanceof Element ? event.target.closest("a") : null;

      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href");

      if (!href || href.startsWith("#") || href.startsWith("mailto:")) return;
      const url = new URL(href, window.location.href);

      if (url.origin !== window.location.origin) return;

      if (url.pathname === window.location.pathname) return;
      start();
    };

    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", start);

    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", start);
      clearTimeout(timer.current);
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the landing path is the signal
  useEffect(() => {
    clearTimeout(timer.current);
    setPending(false);
  }, [pathname]);

  if (!pending) return null;

  return (
    <div
      role="progressbar"
      aria-label={t("loadingPage")}
      className="pointer-events-none absolute inset-x-0 top-0 h-0.5 overflow-hidden"
    >
      <div className="h-full w-1/3 animate-[route-progress_1s_var(--ease-out)_infinite] bg-royal" />
    </div>
  );
}
