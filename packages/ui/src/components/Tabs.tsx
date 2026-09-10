"use client";

import * as RadixTabs from "@radix-ui/react-tabs";
import type { ReactNode } from "react";
import { cn } from "../cn";

export type TabsPanel = { key: string; label: ReactNode; icon?: ReactNode; content: ReactNode };

/** In-page tabs with the DMOJ `make_tab` look, for panels that swap without a
 *  navigation. Use `TabBar` when the tabs are links to other routes. */
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
    <RadixTabs.Root
      defaultValue={defaultValue ?? panels[0]?.key}
      value={value}
      onValueChange={onValueChange}
      className={cn(className)}
    >
      <div className="tabs">
        {title ? <h2>{title}</h2> : <span />}
        <RadixTabs.List asChild>
          <ul>
            {panels.map((panel) => (
              <li key={panel.key} className="tab">
                <RadixTabs.Trigger value={panel.key} asChild>
                  <button type="button">
                    {panel.icon ? <span className="tab-icon">{panel.icon}</span> : null}
                    {panel.label}
                  </button>
                </RadixTabs.Trigger>
              </li>
            ))}
          </ul>
        </RadixTabs.List>
      </div>
      {panels.map((panel) => (
        <RadixTabs.Content key={panel.key} value={panel.key}>
          {panel.content}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  );
}
