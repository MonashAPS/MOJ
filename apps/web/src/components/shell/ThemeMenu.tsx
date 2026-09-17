"use client";

import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  ToggleGroup,
  ToggleGroupItem,
  Tooltip,
} from "@moj/ui";
import { Check, Palette } from "lucide-react";
import { useTranslations } from "next-intl";
import { SKIN_FAMILIES, type Skin, type SkinFamily, skinFamily } from "@/lib/skin";
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

const FAMILY_LABEL: Record<SkinFamily, string> = { maps: "skinMaps", domjudge: "skinDomjudge" };

/** The skin each card previews and selects; its variants sit behind the card. */
const FAMILY_SKIN: Record<SkinFamily, Skin> = { maps: "maps", domjudge: "domjudge" };

/**
 * Picking how the site looks: which design language, how much of it, and light
 * or dark within that.
 *
 * The questions are asked separately because they are separate — DOMjudge has a
 * dark mode of its own, and somebody who wants the house look at night should
 * not have to give up one to get the other. Choosing DOMjudge then asks how far
 * it goes: its colours over our pages, or its pages as well.
 */
export function ThemeMenu({ theme, className }: { theme?: ThemeChoice; className?: string }) {
  const t = useTranslations("common.nav");
  const { skin, choose } = useSkinChoice();
  const family = skinFamily(skin);

  return (
    <div className={cn("grid gap-2", className)}>
      <div className="grid grid-cols-2 gap-2">
        {SKIN_FAMILIES.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={family === option}
            // Staying inside a family keeps the variant: pressing the card you
            // are already on must not quietly undo the choice behind it.
            onClick={() => choose(family === option ? skin : FAMILY_SKIN[option])}
            className={cn(
              "grid cursor-pointer gap-1 rounded-md border p-1 text-left transition-[background-color,border-color]",
              "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-royal/60",
              family === option
                ? "border-primary bg-primary-soft"
                : "border-border hover:border-primary hover:bg-secondary",
            )}
          >
            <SkinPreview skin={FAMILY_SKIN[option]} />
            <span className="flex items-center justify-between gap-1 px-0.5 text-sm font-medium">
              {t(FAMILY_LABEL[option])}
              {family === option ? <Check size={13} aria-hidden className="text-primary" /> : null}
            </span>
          </button>
        ))}
      </div>

      {/* How far DOMjudge goes. The house skin has no such question: it is the
          one the pages were built for. */}
      {family === "domjudge" ? (
        <ToggleGroup
          type="single"
          value={skin}
          onValueChange={(value) => {
            if (value === "domjudge" || value === "domjudge-structure") choose(value);
          }}
          aria-label={t("skinDepth")}
        >
          <ToggleGroupItem value="domjudge">{t("skinColour")}</ToggleGroupItem>
          <ToggleGroupItem value="domjudge-structure">{t("skinColourStructure")}</ToggleGroupItem>
        </ToggleGroup>
      ) : null}

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
