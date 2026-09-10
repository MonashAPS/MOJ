"use client";

import * as ContextMenuPrimitive from "@radix-ui/react-context-menu";
import * as HoverCardPrimitive from "@radix-ui/react-hover-card";
import type { ComponentProps } from "react";
import { cn } from "../cn";
import { disabledItem, menuItem, overlayMotion, overlayPanel } from "../styles";

export const ContextMenu = (props: ComponentProps<typeof ContextMenuPrimitive.Root>) => (
  <ContextMenuPrimitive.Root data-slot="context-menu" {...props} />
);

export const ContextMenuTrigger = (props: ComponentProps<typeof ContextMenuPrimitive.Trigger>) => (
  <ContextMenuPrimitive.Trigger data-slot="context-menu-trigger" {...props} />
);

export function ContextMenuContent({
  className,
  ...props
}: ComponentProps<typeof ContextMenuPrimitive.Content>) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content
        data-slot="context-menu-content"
        className={cn(
          overlayPanel,
          overlayMotion,
          "z-(--z-dialog) min-w-[180px] overflow-hidden p-1",
          className,
        )}
        {...props}
      />
    </ContextMenuPrimitive.Portal>
  );
}

export function ContextMenuItem({
  className,
  variant = "default",
  ...props
}: ComponentProps<typeof ContextMenuPrimitive.Item> & { variant?: "default" | "destructive" }) {
  return (
    <ContextMenuPrimitive.Item
      data-slot="context-menu-item"
      data-variant={variant}
      className={cn(
        menuItem,
        "outline-none data-[variant=destructive]:text-danger-ink",
        disabledItem,
        className,
      )}
      {...props}
    />
  );
}

export function ContextMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof ContextMenuPrimitive.Separator>) {
  return <ContextMenuPrimitive.Separator className={cn("-mx-1 my-1 h-px bg-border", className)} {...props} />;
}

export const HoverCard = (props: ComponentProps<typeof HoverCardPrimitive.Root>) => (
  <HoverCardPrimitive.Root data-slot="hover-card" openDelay={80} closeDelay={150} {...props} />
);

export const HoverCardTrigger = (props: ComponentProps<typeof HoverCardPrimitive.Trigger>) => (
  <HoverCardPrimitive.Trigger data-slot="hover-card-trigger" {...props} />
);

export function HoverCardContent({
  className,
  align = "center",
  sideOffset = 6,
  ...props
}: ComponentProps<typeof HoverCardPrimitive.Content>) {
  return (
    <HoverCardPrimitive.Portal>
      <HoverCardPrimitive.Content
        data-slot="hover-card-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(overlayPanel, overlayMotion, "z-(--z-dialog) w-64 p-4 outline-none", className)}
        {...props}
      />
    </HoverCardPrimitive.Portal>
  );
}
