import { cn } from "@moj/ui";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/shell/ThemeToggle";

/** The full-page auth frame: the club grid at full strength on the page ground, the
 *  wordmark on its navy plate, and the one card in the product that carries the
 *  offset block. Everything on /accounts/login/ and /accounts/register/ lives in it. */
export function AuthCard({
  title,
  subtitle,
  wide = false,
  footer,
  children,
}: {
  title: ReactNode;
  subtitle: ReactNode;
  /** Register widens the card to 660px for its two-column grid. */
  wide?: boolean;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    // The shell paints the club's royal grid on the ground for every /accounts/
    // route, so this frame does not lay one of its own over the top.
    <div className="relative flex min-h-[calc(100dvh_-_var(--nav-height)_-_var(--space-6))] flex-col items-center justify-center py-8">
      <div className="absolute right-0 top-0">
        <ThemeToggle label={false} />
      </div>

      <div className="relative flex w-full flex-col items-center gap-5">
        <span className="inline-flex items-center rounded-md bg-nav px-4 py-2.5">
          {/* The wordmark is white and needs a dark ground, so it keeps one of its own. */}
          <img src="/logo.svg" alt="MAPS Online Judge" className="h-7 w-auto" />
        </span>

        <div
          className={cn(
            "w-full rounded-md border border-border-strong bg-card p-8 shadow-hard",
            wide ? "max-w-[660px]" : "max-w-[420px]",
          )}
        >
          <h1 className="font-display text-h1 font-bold tracking-tight text-foreground">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          <div className="mt-6">{children}</div>
          {footer ? (
            <div className="mt-5 border-t border-border pt-4 text-sm text-muted-foreground">{footer}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
