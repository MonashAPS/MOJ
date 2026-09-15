"use client";

import { api } from "@convex/_generated/api";
import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  cn,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Tooltip,
} from "@moj/ui";
import { useQuery } from "convex/react";
import { PanelsTopLeft, Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { ADMIN_SECTIONS } from "./sections";

/** DMOJ's `/admin` had Django's sidebar; this is the same idea on the tokens:
 *  a 220px rail of sections, icons only under 1100px, a Sheet under 900px. */
function RailLinks({ onNavigate, iconsOnly }: { onNavigate?: () => void; iconsOnly?: boolean }) {
  const t = useTranslations("admin.components.chrome");
  const sections = useTranslations("admin.shell.sections");
  const pathname = usePathname() ?? "";

  return (
    <nav aria-label={t("sections")} className="grid gap-4 py-3">
      {ADMIN_SECTIONS.map((group) => (
        <div key={group.key} className="grid gap-0.5">
          <span
            className={cn(
              "px-3 pb-1 font-sans text-xs font-semibold uppercase tracking-label text-muted-foreground",
              iconsOnly && "sr-only",
            )}
          >
            {sections(`groups.${group.key}`)}
          </span>
          {group.items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href);
            const Icon = item.icon;

            const link = (
              <Link
                key={item.key}
                href={item.href}
                aria-current={active ? "page" : undefined}
                aria-label={iconsOnly ? sections(`items.${item.key}`) : undefined}
                onClick={onNavigate}
                className={cn(
                  "flex h-[30px] items-center gap-2 rounded-md px-3 text-base text-subtle",
                  "transition-colors hover:bg-row-hover hover:text-foreground",
                  "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-royal/45",
                  iconsOnly && "justify-center px-0",
                  active &&
                    "bg-row-selected font-medium text-foreground shadow-[inset_2px_0_0_var(--brand-royal)]",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className={cn("truncate", iconsOnly && "sr-only")}>
                  {sections(`items.${item.key}`)}
                </span>
              </Link>
            );

            return iconsOnly ? (
              <Tooltip key={item.key} content={sections(`items.${item.key}`)} side="right">
                {link}
              </Tooltip>
            ) : (
              link
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/** Jumps to a problem, contest or user by name from anywhere in the console. */
function ConsoleSearch() {
  const t = useTranslations("admin.components.chrome");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const hits = useQuery(api.search.global, term.trim() ? { term: term.trim(), limit: 6 } : "skip");

  const targets: { key: string; label: string; hint: string; href: string }[] = (hits ?? [])
    .filter((hit) => hit.kind === "problem" || hit.kind === "contest" || hit.kind === "user")
    .map((hit) => ({
      key: `${hit.kind}:${hit.id}`,
      label: hit.title,
      hint: hit.subtitle ?? "",
      href:
        hit.kind === "problem"
          ? `/admin/problems/${hit.subtitle}/`
          : hit.kind === "contest"
            ? `/admin/contests/${hit.subtitle}/`
            : `/admin/users/${hit.title}/`,
    }));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="secondary"
          size="sm"
          icon={<Search aria-hidden />}
          className="w-[260px] justify-start font-normal text-muted-foreground max-[900px]:w-[160px]"
        >
          {t("search")}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[320px] p-0">
        <Command shouldFilter={false}>
          <CommandInput
            value={term}
            onValueChange={setTerm}
            placeholder={t("searchPlaceholder")}
            showEscHint={false}
          />
          <CommandList>
            <CommandEmpty>
              {term.trim() ? t("noMatches", { term: term.trim() }) : t("searchPrompt")}
            </CommandEmpty>
            {targets.length > 0 ? (
              <CommandGroup>
                {targets.map((target) => (
                  <CommandItem
                    key={target.key}
                    value={target.key}
                    onSelect={() => {
                      setOpen(false);
                      router.push(target.href);
                    }}
                  >
                    <span className="truncate">{target.label}</span>
                    {target.hint ? (
                      <span className="ml-auto font-mono text-sm text-muted-foreground">{target.hint}</span>
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** The console frame: rail, a bar carrying the search, and the page column. */
export function AdminChrome({ children }: { children: ReactNode }) {
  const t = useTranslations("admin.components.chrome");
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="-mx-(--gutter) -my-6 flex min-h-[calc(100dvh-var(--header-height,47px))] min-w-0 items-stretch min-[760px]:-mx-(--gutter-lg)">
      {/* `self-stretch` so the rail's ground runs the whole height of the
          column: the sticky block inside is only as tall as its links, and
          without this the page ended in a band of nothing below them. */}
      <aside className="shrink-0 self-stretch border-r border-border bg-secondary max-[900px]:hidden">
        <div className="sticky top-(--header-height,47px) w-[220px] max-[1100px]:w-[52px]">
          <div className="max-[1100px]:hidden">
            <RailLinks />
          </div>
          <div className="hidden max-[1100px]:block">
            <RailLinks iconsOnly />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-secondary px-(--gutter)">
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("sections")}
                className="hidden max-[900px]:inline-flex"
              >
                <PanelsTopLeft aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[260px] p-0">
              <SheetHeader>
                <SheetTitle>{t("sheetTitle")}</SheetTitle>
              </SheetHeader>
              <div className="px-2">
                <RailLinks onNavigate={() => setSheetOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>

          <span className="font-sans text-xs font-semibold uppercase tracking-label text-muted-foreground">
            {t("staffConsole")}
          </span>
          <div className="ml-auto">
            <ConsoleSearch />
          </div>
        </div>

        <div className="min-h-0 min-w-0 flex-1 px-(--gutter) py-4">{children}</div>
      </div>
    </div>
  );
}
