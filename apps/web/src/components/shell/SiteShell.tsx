"use client";

import { TooltipProvider } from "@moj/ui";
import type { ReactNode } from "react";
import { CommandPalette, useCommandPalette } from "@/components/CommandPalette";
import { ProfileBootstrap } from "@/components/ProfileBootstrap";
import type { NavNode } from "@/lib/nav";
import { Announcement } from "./Announcement";
import { ContestNavigation } from "./ContestNavigation";
import { Footer } from "./Footer";
import { NavBar } from "./NavBar";
import type { ViewerSummary } from "./UserBlock";

export function SiteShell({
  nav,
  misc,
  viewer,
  registrationOpen,
  children,
}: {
  nav: NavNode[];
  misc: Record<string, string>;
  viewer: ViewerSummary | null;
  registrationOpen: boolean;
  children: ReactNode;
}) {
  const [paletteOpen, setPaletteOpen] = useCommandPalette();

  return (
    <TooltipProvider delayDuration={250}>
      <a className="skip-link" href="#content">
        Skip to content
      </a>
      <NavBar
        nav={nav}
        viewer={viewer}
        registrationOpen={registrationOpen}
        onOpenSearch={() => setPaletteOpen(true)}
      />
      <ProfileBootstrap />
      <ContestNavigation />
      <div id="page-container">
        <br />
        <main id="content">{children}</main>
        <Announcement html={misc.announcement} />
        <Footer footerHtml={misc.footer} />
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </TooltipProvider>
  );
}
