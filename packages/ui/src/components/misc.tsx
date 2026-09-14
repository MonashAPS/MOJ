"use client";

import * as AvatarPrimitive from "@radix-ui/react-avatar";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import * as SeparatorPrimitive from "@radix-ui/react-separator";
import { Loader2 } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "../cn";
import { useUiText } from "../ui-text";

/* Avatar ------------------------------------------------------------------- */

export function Avatar({ className, ...props }: ComponentProps<typeof AvatarPrimitive.Root>) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn("relative flex size-6 shrink-0 overflow-hidden rounded-full bg-secondary", className)}
      {...props}
    />
  );
}

export function AvatarImage({ className, ...props }: ComponentProps<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn("aspect-square size-full", className)}
      {...props}
    />
  );
}

export function AvatarFallback({ className, ...props }: ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "flex size-full items-center justify-center rounded-full bg-secondary text-xs font-semibold text-subtle",
        className,
      )}
      {...props}
    />
  );
}

/* Progress ----------------------------------------------------------------- */

export function Progress({
  className,
  value,
  tone = "royal",
  ...props
}: ComponentProps<typeof ProgressPrimitive.Root> & { tone?: "royal" | "good" | "warn" | "bad" }) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn("relative h-1 w-full overflow-hidden rounded-full bg-well", className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn(
          "size-full flex-1 transition-transform",
          tone === "royal" && "bg-royal",
          tone === "good" && "bg-good",
          tone === "warn" && "bg-warn",
          tone === "bad" && "bg-bad",
        )}
        style={{ transform: `translateX(-${100 - (value ?? 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}

/* Separator ---------------------------------------------------------------- */

export function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
  ...props
}: ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      data-slot="separator"
      decorative={decorative}
      orientation={orientation}
      className={cn(
        "shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full",
        "data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px",
        className,
      )}
      {...props}
    />
  );
}

/* Scroll area -------------------------------------------------------------- */

export function ScrollArea({
  className,
  children,
  viewportClassName,
  ...props
}: ComponentProps<typeof ScrollAreaPrimitive.Root> & { viewportClassName?: string }) {
  return (
    <ScrollAreaPrimitive.Root data-slot="scroll-area" className={cn("relative", className)} {...props}>
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        className={cn("size-full rounded-[inherit] outline-none", viewportClassName)}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}

export function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      className={cn(
        "flex touch-none select-none p-px transition-colors",
        orientation === "vertical" && "h-full w-2.5 border-l border-l-transparent",
        orientation === "horizontal" && "h-2.5 flex-col border-t border-t-transparent",
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb
        data-slot="scroll-area-thumb"
        className="relative flex-1 rounded-full bg-border-strong"
      />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  );
}

/* Skeleton ----------------------------------------------------------------- */

/** A skeleton mirrors the real row's geometry. Never a centred spinner for a list. */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "rounded-md bg-secondary bg-[linear-gradient(90deg,var(--surface-2),var(--surface-3),var(--surface-2))]",
        "bg-[length:200%_100%] animate-shimmer",
        className,
      )}
      {...props}
    />
  );
}

/* Spinner ------------------------------------------------------------------ */

/** Twelve lines of CSS on a Lucide glyph. Words beat spinners; use this only where
 *  a word will not fit. */
export function Spinner({ className, ...props }: ComponentProps<typeof Loader2>) {
  const ui = useUiText();
  return (
    <Loader2
      role="status"
      aria-label={ui.loading}
      className={cn("size-4 animate-spin-slow", className)}
      {...props}
    />
  );
}
