"use client";

import { Command as CommandPrimitive } from "cmdk";
import { Search } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "../cn";
import { disabledCmdkItem } from "../styles";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./dialog";
import { Kbd } from "./kbd";

export function Command({ className, ...props }: ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn(
        "flex h-full w-full flex-col overflow-hidden bg-popover text-popover-foreground",
        className,
      )}
      {...props}
    />
  );
}

/** The command palette shell: a Radix Dialog panel at 12vh, 640px wide, so it
 *  gets Escape, the focus trap, the scroll lock and the backdrop for free.
 *  Opening is a fade plus a .98 scale; reduced motion drops the scale. */
export function CommandDialog({
  title = "Search",
  description = "Search problems, contests, users and organisations.",
  children,
  className,
  shouldFilter,
  ...props
}: ComponentProps<typeof Dialog> & {
  title?: string;
  description?: string;
  className?: string;
  /** Turn cmdk's own filter off when the results are already ranked upstream. */
  shouldFilter?: boolean;
}) {
  return (
    <Dialog {...props}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          "top-[12vh] max-w-[640px] translate-y-0 gap-0 overflow-hidden p-0 duration-(--dur)",
          className,
        )}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">{description}</DialogDescription>
        <Command loop shouldFilter={shouldFilter}>
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  );
}

export function CommandInput({
  className,
  showEscHint = true,
  ...props
}: ComponentProps<typeof CommandPrimitive.Input> & { showEscHint?: boolean }) {
  return (
    <div
      data-slot="command-input-wrapper"
      className="flex h-12 items-center gap-3 border-b border-border px-4"
    >
      <Search className="size-[18px] shrink-0 text-muted-foreground" aria-hidden />
      <CommandPrimitive.Input
        data-slot="command-input"
        className={cn(
          "flex h-full w-full bg-transparent text-[16px] text-foreground outline-none md:text-md",
          "placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
      {showEscHint ? <Kbd className="shrink-0">Esc</Kbd> : null}
    </div>
  );
}

export function CommandList({ className, ...props }: ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn("max-h-[min(60vh,380px)] scroll-py-1 overflow-y-auto overflow-x-hidden", className)}
      {...props}
    />
  );
}

export function CommandEmpty(props: ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className="px-4 py-8 text-center text-sm text-muted-foreground"
      {...props}
    />
  );
}

export function CommandGroup({ className, ...props }: ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        "overflow-hidden p-1 text-foreground",
        "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5",
        "[&_[cmdk-group-heading]]:font-sans [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold",
        "[&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-label [&_[cmdk-group-heading]]:text-subtle",
        className,
      )}
      {...props}
    />
  );
}

export function CommandSeparator({ className, ...props }: ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn("-mx-1 h-px bg-border", className)}
      {...props}
    />
  );
}

export function CommandItem({ className, ...props }: ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        "relative flex h-9 cursor-default select-none items-center gap-3 rounded-sm px-2 text-base outline-none",
        "data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "[&_svg:not([class*='text-'])]:text-muted-foreground",
        disabledCmdkItem,
        className,
      )}
      {...props}
    />
  );
}

export function CommandShortcut({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn("ml-auto shrink-0 font-mono text-sm tabular-nums text-muted-foreground", className)}
      {...props}
    />
  );
}
