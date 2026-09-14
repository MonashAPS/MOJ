"use client";

import { CircleHelp, Lock } from "lucide-react";
import { useTranslations } from "next-intl";

/** Enough rows to read as a problem table without being one. */
const ROWS = ["w-[42%]", "w-[56%]", "w-[35%]", "w-[61%]", "w-[48%]", "w-[39%]"];

/**
 * The problem table, withheld.
 *
 * Blurred bars rather than an absent section: a contest with problems and a
 * contest that has not released them look nothing alike, and saying which it is
 * saves somebody wondering whether the page is broken. Nothing real is sent to
 * the browser, so there is nothing to read out of the markup.
 */
export function ProblemsNotReleased() {
  const t = useTranslations("contests.detail");

  return (
    <section className="mt-8 grid gap-2">
      <h2 className="flex items-center gap-2 font-display text-h2 font-semibold">
        <CircleHelp size={18} className="text-muted-foreground" aria-hidden />
        {t("problems")}
      </h2>

      <div className="relative">
        <div
          aria-hidden
          className="select-none blur-[3px] [mask-image:linear-gradient(to_bottom,black,transparent)]"
        >
          <div className="overflow-hidden rounded-md border border-border">
            <div className="flex gap-4 border-b border-border bg-secondary px-3 py-2">
              <div className="h-3.5 w-1/3 rounded bg-muted-foreground/30" />
              <div className="ml-auto h-3.5 w-14 rounded bg-muted-foreground/30" />
              <div className="h-3.5 w-14 rounded bg-muted-foreground/30" />
            </div>
            {ROWS.map((width) => (
              <div
                key={width}
                className="flex items-center gap-4 border-b border-border px-3 py-2.5 last:border-b-0"
              >
                <div className={`h-4 rounded bg-muted-foreground/25 ${width}`} />
                <div className="ml-auto h-4 w-10 rounded bg-muted-foreground/25" />
                <div className="h-4 w-10 rounded bg-muted-foreground/25" />
              </div>
            ))}
          </div>
        </div>

        <div className="absolute inset-0 flex items-start justify-center pt-14">
          <div className="max-w-sm rounded-lg border border-border bg-card px-5 py-4 text-center shadow-lg">
            <Lock size={20} aria-hidden className="mx-auto text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">{t("problemsNotReleased")}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
