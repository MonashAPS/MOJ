"use client";

import { api } from "@convex/_generated/api";
import { cn, ToggleGroup, ToggleGroupItem, Tooltip } from "@moj/ui";
import { useMutation } from "convex/react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

export type ThemeChoice = "auto" | "light" | "dark";

const STORAGE_KEY = "moj-theme";

function apply(theme: ThemeChoice) {
  const root = document.documentElement;
  if (theme === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  try {
    if (theme === "auto") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // private mode, nothing to do
  }
}

function useTheme(initial: ThemeChoice) {
  const [theme, setTheme] = useState<ThemeChoice>(initial);
  const persist = useMutation(api.profiles.setTheme);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "dark" || stored === "light") setTheme(stored);
      else if (initial !== "auto") apply(initial);
    } catch {
      // ignore
    }
  }, [initial]);

  const choose = useCallback(
    (next: ThemeChoice) => {
      setTheme(next);
      apply(next);
      // Anonymous viewers have no profile to write to; the local choice stands.
      void persist({ siteTheme: next }).catch(() => undefined);
    },
    [persist],
  );

  return [theme, choose] as const;
}

/** The three-way control that lives in the user dropdown. */
export function ThemeSegmented({
  initial = "auto",
  className,
}: {
  initial?: ThemeChoice;
  className?: string;
}) {
  const [theme, choose] = useTheme(initial);
  return (
    <ToggleGroup
      type="single"
      value={theme}
      onValueChange={(value) => value && choose(value as ThemeChoice)}
      aria-label="Theme"
      className={className}
    >
      <ToggleGroupItem value="auto" aria-label="Follow the system">
        <Monitor aria-hidden />
        System
      </ToggleGroupItem>
      <ToggleGroupItem value="light" aria-label="Light">
        <Sun aria-hidden />
        Light
      </ToggleGroupItem>
      <ToggleGroupItem value="dark" aria-label="Dark">
        <Moon aria-hidden />
        Dark
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

/** The compact cycling button, for the auth pages and anywhere the segmented
 *  control will not fit. */
export function ThemeToggle({
  initial = "auto",
  label = false,
  className,
}: {
  initial?: ThemeChoice;
  label?: boolean;
  className?: string;
}) {
  const [theme, choose] = useTheme(initial);
  const next: ThemeChoice = theme === "dark" ? "light" : theme === "light" ? "auto" : "dark";
  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  const title = `Theme: ${theme === "auto" ? "system" : theme}. Switch to ${next === "auto" ? "system" : next}.`;

  return (
    <Tooltip content={title}>
      <button
        type="button"
        aria-label={title}
        onClick={() => choose(next)}
        className={cn(
          "inline-flex h-(--control-h) items-center gap-2 rounded-md border border-border-strong bg-card px-3",
          "text-sm text-subtle transition-colors hover:bg-secondary hover:text-foreground",
          "focus-visible:outline-none focus-visible:border-royal focus-visible:ring-[3px] focus-visible:ring-royal/45",
          !label && "w-(--control-h) justify-center px-0",
          className,
        )}
      >
        <Icon size={16} aria-hidden />
        {label ? <span>Theme</span> : null}
      </button>
    </Tooltip>
  );
}
