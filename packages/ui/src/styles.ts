/** Class fragments every control in the kit shares.
 *
 * These are plain string literals so Tailwind's scanner finds them here; a
 * component composes them through `cn()` and never re-invents a focus ring or a
 * disabled treatment. 
 */

/** One ring, everywhere: a 3px 45% royal halo plus a border recolour, no offset,
 *  so focus never changes layout and is never clipped inside a table cell. */
export const focusRing =
  "outline-none focus-visible:border-royal focus-visible:ring-[3px] focus-visible:ring-royal/45 aria-invalid:border-bad aria-invalid:ring-[3px] aria-invalid:ring-bad/25";

/** The same ring drawn inside the element, for rows and cells that live inside an
 *  `overflow: hidden` wrapper. */
export const focusRingInset =
  "outline-none focus-visible:outline-2 focus-visible:outline-royal focus-visible:-outline-offset-2";

/** Icons inside a control: never a click target, never stretched, 16px unless the
 *  call site says otherwise. */
export const controlIcons =
  "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

/** 50% opacity is the universal disabled signal; actions stop taking pointers and
 *  form controls show the not-allowed cursor. */
export const disabledAction = "disabled:pointer-events-none disabled:opacity-50";
export const disabledField = "disabled:cursor-not-allowed disabled:opacity-50";
export const disabledItem = "data-[disabled]:pointer-events-none data-[disabled]:opacity-50";
export const disabledCmdkItem = "data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50";

/** Overlay panels: menus, popovers, selects. One recipe, one shadow, one z-slot. */
export const overlayPanel = "bg-popover text-popover-foreground border border-border rounded-md shadow-2";

/** Radix enter/leave, inverted for anything that descends from a trigger. */
export const overlayMotion =
  "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1";

/** A menu row: 32px, 4px radius, royal-neutral highlight, muted leading icon. */
export const menuItem =
  "relative flex h-8 cursor-default select-none items-center gap-2 rounded-sm px-2 text-base text-foreground data-[inset]:pl-8 data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground";

/** The micro-label: 11px / 600 / 0.12em uppercase. The only small-caps device
 *  in the product; ad-hoc `uppercase text-xs tracking-wide` is not allowed. */
export const microLabel = "font-sans text-xs font-semibold uppercase tracking-label text-subtle";

/** Anything that is data: codes, points, times, memory, ids, dates, ranks. */
export const monoData = "font-mono tabular-nums";
