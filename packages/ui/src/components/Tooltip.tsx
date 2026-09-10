"use client";

import * as RadixTooltip from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";

export const TooltipProvider = RadixTooltip.Provider;

export function Tooltip({
  content,
  children,
  side = "top",
}: {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
}) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={5}
          style={{
            background: "var(--nav)",
            color: "var(--on-nav)",
            padding: "4px 8px",
            borderRadius: "var(--radius)",
            fontSize: "0.9em",
            maxWidth: 280,
            zIndex: 1200,
          }}
        >
          {content}
          <RadixTooltip.Arrow style={{ fill: "var(--nav)" }} />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
