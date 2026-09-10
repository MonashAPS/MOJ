import { api } from "@convex/_generated/api";
import { ratingClass } from "@moj/ui";
import type { Metadata, Viewport } from "next";
import { ConvexClientProvider } from "@/auth/convex-client";
import { getServerSession } from "@/auth/session";
import { BrandingStyle } from "@/components/BrandingStyle";
import { SiteShell } from "@/components/shell/SiteShell";
import { ThemeScript } from "@/components/shell/ThemeScript";
import { query, queryAsViewer } from "@/lib/convex-server";
import { gravatarUrl } from "@/lib/gravatar";
import { viewerLanguage } from "@/lib/language.server";
import "./globals.css";

/** SPEC section 24: an operator renames and re-skins the site from the console,
 *  so the title and the favicon come from `site.branding` when they are set. */
export async function generateMetadata(): Promise<Metadata> {
  const branding = await query(api.site.branding, {}).catch(() => null);
  const name = branding?.siteName ?? "MOJ";
  const longName = branding?.siteLongName ?? "MAPS Online Judge";
  return {
    title: { default: name, template: `%s - ${longName}` },
    description: `The ${longName}: problems, contests and rankings for Monash Algorithms and Problem Solving.`,
    icons: branding?.faviconUrl
      ? { icon: [{ url: branding.faviconUrl }], shortcut: branding.faviconUrl }
      : {
          icon: [
            { url: "/favicon-96x96.png", type: "image/png", sizes: "96x96" },
            { url: "/icon.svg", type: "image/svg+xml" },
          ],
          shortcut: "/favicon.ico",
          apple: "/apple-touch-icon.png",
        },
    manifest: "/site.webmanifest",
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [shell, viewerState, session, language, branding] = await Promise.all([
    query(api.site.shell, {}).catch(() => null),
    queryAsViewer(api.viewer.current, {}).catch(() => null),
    getServerSession().catch(() => null),
    viewerLanguage(),
    query(api.site.branding, {}).catch(() => null),
  ]);

  const profile = viewerState?.profile ?? null;
  const viewer = profile
    ? {
        username: profile.username,
        displayName: profile.usernameDisplayOverride || profile.username,
        isStaff: profile.isStaff || profile.isSuperuser,
        ratingClass: ratingClass(profile.rating),
        siteTheme: profile.siteTheme,
        gravatarUrl: gravatarUrl(session?.user.email, 64),
        // The admin plugin stamps the acting superuser onto the session; the
        // dropdown's "Stop impersonating" row hangs off this.
        isImpersonating: Boolean(
          (session?.session as { impersonatedBy?: string | null } | undefined)?.impersonatedBy,
        ),
      }
    : null;

  return (
    <html lang={language} data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <ThemeScript defaultTheme={branding?.themeDefault ?? "system"} />
        <BrandingStyle branding={branding} />
      </head>
      <body>
        <ConvexClientProvider>
          <SiteShell
            nav={shell?.nav ?? []}
            misc={shell?.misc ?? {}}
            viewer={viewer}
            registrationOpen={shell?.settings?.registrationOpen ?? true}
            language={language}
            logoUrl={branding?.logoUrl ?? null}
            siteName={branding?.siteLongName ?? "MAPS Online Judge"}
          >
            {children}
          </SiteShell>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
