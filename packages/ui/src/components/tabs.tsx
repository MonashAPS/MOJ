"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn";
import { focusRing } from "../styles";

export const TabsRoot = ({ className, ...props }: ComponentProps<typeof TabsPrimitive.Root>) => (
  <TabsPrimitive.Root data-slot="tabs" className={cn("flex flex-col gap-4", className)} {...props} />
);

/** Segmented tabs: All / Mine, List / Calendar. Inside a panel, never under a title. */
export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "inline-flex h-(--control-h) w-fit items-center justify-center rounded-md bg-secondary p-[3px]",
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xs px-3",
        "font-sans text-sm font-medium text-subtle transition-[color,background-color,box-shadow]",
        "data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-1",
        "disabled:pointer-events-none disabled:opacity-50",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
        focusRing,
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  );
}

export type TabsPanel = { key: string; label: ReactNode; icon?: ReactNode; content: ReactNode };

/** The everyday form: hand it panels. */
export function Tabs({
  panels,
  defaultValue,
  value,
  onValueChange,
  title,
  className,
}: {
  panels: TabsPanel[];
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  title?: ReactNode;
  className?: string;
}) {
  return (
    <TabsRoot
      defaultValue={defaultValue ?? panels[0]?.key}
      value={value}
      onValueChange={onValueChange}
      className={className}
    >
      <div className="flex flex-wrap items-center gap-3">
        {title ? <h2 className="font-display text-h2 font-semibold tracking-tight">{title}</h2> : null}
        <TabsList className="ml-auto">
          {panels.map((panel) => (
            <TabsTrigger key={panel.key} value={panel.key}>
              {panel.icon}
              {panel.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {panels.map((panel) => (
        <TabsContent key={panel.key} value={panel.key}>
          {panel.content}
        </TabsContent>
      ))}
    </TabsRoot>
  );
}
