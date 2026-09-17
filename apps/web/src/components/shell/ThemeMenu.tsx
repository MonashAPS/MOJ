"use client";

import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Tooltip,
} from "@moj/ui";
import { Check, Palette } from "lucide-react";
import { useTranslations } from "next-intl";
import { SKINS, type Skin } from "@/lib/skin";
import { useSkinChoice } from "./SkinProvider";
import { type ThemeChoice, ThemeSegmented } from "./ThemeToggle";

/**
 * The site in miniature: the nav slab and its keyline, a panel with its
 * titlebar, two lines of text and a button.
 *
 * It carries `data-skin` and nothing else, so every colour in it is the skin's
 * own — the same tokens the real page is painted from. That is what makes it a
 * preview rather than a drawing of one, and it is why the skins are declared on
 * an attribute selector rather than on `:root`.
 */
function SkinPreview({ skin }: { skin: Skin }) {
  return (
    <span
      aria-hidden
      data-skin={skin}
      className="block overflow-hidden rounded-sm border border-border bg-ground"
    >
      <span className="flex h-3.5 items-center gap-1 bg-nav px-1.5">
        <span className="h-1 w-5 rounded-full bg-nav-ink/85" />
        <span className="h-1 w-3 rounded-full bg-nav-ink/40" />
        <span className="ml-auto size-1.5 rounded-full bg-nav-ink/60" />
      </span>
      <span className="block h-[2px] bg-royal" />
      <span className="grid gap-1 p-1.5">
        <span className="block h-2 rounded-xs bg-titlebar" />
        <span className="flex items-center gap-1">
          <span className="h-1.5 flex-1 rounded-full bg-foreground/40" />
          <span className="h-1.5 w-3 rounded-full bg-good" />
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 flex-1 rounded-full bg-foreground/20" />
          <span className="h-3 w-5 rounded-xs bg-primary" />
        </span>
      </span>
    </span>
  );
}

const SKIN_LABEL: Record<Skin, string> = { maps: "skinMaps", domjudge: "skinDomjudge" };

/**
 * Picking how the site looks: which design language, and light or dark within
 * it.
 *
 * The two are separate questions and the menu asks them separately — DOMjudge
 * has a dark mode of its own, and somebody who wants the house look at night
 * should not have to give up one to get the other.
 */
export function ThemeMenu({ theme, className }: { theme?: ThemeChoice; className?: string }) {
  const t = useTranslations("common.nav");
  const { skin, choose } = useSkinChoice();

  return (
    <div className={cn("grid gap-2", className)}>
      <div className="grid grid-cols-2 gap-2">
        {SKINS.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={skin === option}
            onClick={() => choose(option)}
            className={cn(
              "grid cursor-pointer gap-1 rounded-md border p-1 text-left transition-[background-color,border-color]",
              "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-royal/60",
              skin === option
                ? "border-primary bg-primary-soft"
                : "border-border hover:border-primary hover:bg-secondary",
            )}
          >
            <SkinPreview skin={option} />
            <span className="flex items-center justify-between gap-1 px-0.5 text-sm font-medium">
              {t(SKIN_LABEL[option])}
              {skin === option ? <Check size={13} aria-hidden className="text-primary" /> : null}
            </span>
          </button>
        ))}
      </div>
      <ThemeSegmented initial={theme} />
    </div>
  );
}

/** The same menu behind a button on the nav, for a visitor with no account
 *  dropdown to keep it in. */
export function ThemeDropdown() {
  const t = useTranslations("common.nav");

  return (
    <DropdownMenu>
      <Tooltip content={t("theme")}>
        <DropdownMenuTrigger
          aria-label={t("theme")}
          className={cn(
            "inline-flex size-(--control-h) items-center justify-center rounded-md transition-colors",
            "text-nav-ink/80 hover:bg-nav-hover hover:text-nav-ink data-[state=open]:bg-nav-hover",
            "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-royal/60",
          )}
        >
          <Palette size={16} aria-hidden />
        </DropdownMenuTrigger>
      </Tooltip>

      <DropdownMenuContent align="end" sideOffset={6} className="min-w-[260px]">
        <DropdownMenuLabel>{t("theme")}</DropdownMenuLabel>
        <ThemeMenu className="px-1 pb-1" />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
