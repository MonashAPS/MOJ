"use client";

import { Button, cn, focusRing, Sheet, SheetContent, SheetTitle, SheetTrigger } from "@moj/ui";
import { PanelsTopLeft } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useState } from "react";
import { ADMIN_SECTIONS } from "./sections";

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Rail({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Console sections" className="grid gap-4 py-3">
      {ADMIN_SECTIONS.map((group) => (
        <div key={group.label} className="grid gap-0.5">
          <div className="px-3 pb-1 font-sans text-xs font-semibold uppercase tracking-label text-muted-foreground">
            {group.label}
          </div>
          {group.items.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-[30px] items-center gap-2 border-l-2 px-3 text-base text-subtle",
                  "hover:bg-row-hover hover:text-foreground",
                  focusRing,
                  active ? "border-royal bg-row-selected font-medium text-foreground" : "border-transparent",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className="min-w-0 truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/**
 * The staff console frame: a 220px rail of sections beside the work surface.
 * Under 900px the rail becomes a Sheet, so a table never has to share the
 * width with it. Part 1 owns the canonical version of this file.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/admin";
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="flex min-h-0 min-w-0 items-stretch gap-0 text-base">
      <aside className="min-h-0 w-[220px] shrink-0 self-stretch border-r border-border bg-card max-[900px]:hidden">
        <div className="sticky top-(--sticky-top)">
          <Rail pathname={pathname} />
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 px-(--gutter) py-3">
        <div className="shrink-0 min-[900px]:hidden">
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" icon={<PanelsTopLeft aria-hidden />}>
                Sections
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[260px] overflow-y-auto">
              <SheetTitle className="px-3 pt-3">Console</SheetTitle>
              <Rail pathname={pathname} onNavigate={() => setSheetOpen(false)} />
            </SheetContent>
          </Sheet>
        </div>
        {children}
      </div>
    </div>
  );
}
