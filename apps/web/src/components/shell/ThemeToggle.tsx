"use client";

import { api } from "@convex/_generated/api";
import { cn, ToggleGroup, ToggleGroupItem, Tooltip } from "@moj/ui";
import { useMutation } from "convex/react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { THEME_STORAGE_KEY, THEME_SYSTEM } from "@/lib/theme";

export type ThemeChoice = "auto" | "light" | "dark";

/** Reads the choice the viewer has made on this browser, or null if they never
 *  have. Following the system is a stored value, not an empty slot: the two have
 *  to stay distinguishable, because only an empty slot lets the profile's theme
 *  be imposed. */
export function storedTheme(): ThemeChoice | null {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
    return stored === THEME_SYSTEM ? "auto" : null;
  } catch {
    return null;
  }
}

export function applyTheme(theme: ThemeChoice) {
  const root = document.documentElement;
  if (theme === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme === "auto" ? THEME_SYSTEM : theme);
  } catch {
    // private mode, nothing to do
  }
}

function useTheme(initial: ThemeChoice) {
  const [theme, setTheme] = useState<ThemeChoice>(initial);
  const persist = useMutation(api.profiles.setTheme);

  useEffect(() => {
    const stored = storedTheme();
    // The profile's theme is a starting point for a viewer who has never picked
    // one here, never a correction to one they have. The prop is whatever the
    // server rendered, which on a page the browser replays from its cache can be
    // older than the choice sitting in storage.
    if (stored) setTheme(stored);
    else if (initial !== "auto") applyTheme(initial);
  }, [initial]);

  const choose = useCallback(
    (next: ThemeChoice) => {
      setTheme(next);
      applyTheme(next);
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
  tone = "surface",
  className,
}: {
  initial?: ThemeChoice;
  label?: boolean;
  /** `nav` is the ghost-on-navy treatment for the top bar. */
  tone?: "surface" | "nav";
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
          "inline-flex h-(--control-h) items-center gap-2 rounded-md px-3 text-sm transition-colors",
          "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-royal/60",
          tone === "nav"
            ? "text-nav-ink/80 hover:bg-nav-hover hover:text-nav-ink"
            : "border border-border-strong bg-card text-subtle hover:bg-secondary hover:text-foreground focus-visible:border-royal",
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
