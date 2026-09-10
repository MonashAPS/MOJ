"use client";

import { api } from "@convex/_generated/api";
import { useMutation } from "convex/react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export type ThemeChoice = "auto" | "light" | "dark";

function apply(theme: ThemeChoice) {
  const root = document.documentElement;
  if (theme === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  try {
    if (theme === "auto") localStorage.removeItem("moj-theme");
    else localStorage.setItem("moj-theme", theme);
  } catch {
    // private mode, nothing to do
  }
}

export function ThemeToggle({ initial = "auto", label = true }: { initial?: ThemeChoice; label?: boolean }) {
  const [theme, setTheme] = useState<ThemeChoice>(initial);
  const setThemeOnProfile = useMutation(api.profiles.setTheme);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("moj-theme");
      if (stored === "dark" || stored === "light") setTheme(stored);
      else if (initial !== "auto") apply(initial);
    } catch {
      // ignore
    }
  }, [initial]);

  const next: ThemeChoice = theme === "dark" ? "light" : theme === "light" ? "auto" : "dark";
  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  const title = `Theme: ${theme}. Switch to ${next}.`;

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      className="theme-toggle"
      onClick={() => {
        setTheme(next);
        apply(next);
        void setThemeOnProfile({ siteTheme: next }).catch(() => undefined);
      }}
    >
      <Icon size={14} aria-hidden />
      {label ? <span>Dark mode</span> : null}
    </button>
  );
}
