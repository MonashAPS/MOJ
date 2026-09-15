import { api } from "@convex/_generated/api";
import { ratingClass } from "@moj/ui";
import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { ConvexClientProvider } from "@/auth/convex-client";
import { getServerSession } from "@/auth/session";
import { BrandingStyle } from "@/components/shell/BrandingStyle";
import { SiteShell } from "@/components/shell/SiteShell";
import { ThemeScript } from "@/components/shell/ThemeScript";
import { UiText } from "@/components/shell/UiText";
import { query, queryAsViewer } from "@/lib/convex-server";
import { gravatarUrl } from "@/lib/gravatar";
import { viewerLanguage } from "@/lib/language.server";
import { PublicConfigProvider } from "@/lib/public-config";
import { publicConfig } from "@/lib/public-config.server";
import { resolveTheme, THEME_COOKIE } from "@/lib/theme";
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
  // Read here rather than in the bundle: the published image carries no
  // hostnames, and the layout is rendered on every request.
  const config = publicConfig();

  const [shell, viewerState, session, language, branding, jar] = await Promise.all([
    query(api.site.shell, {}).catch(() => null),
    queryAsViewer(api.viewer.current, {}).catch(() => null),
    getServerSession().catch(() => null),
    viewerLanguage(),
    query(api.site.branding, {}).catch(() => null),
    cookies(),
  ]);

  // Rendering the attribute here rather than leaving it to the inline script
  // means the theme is in the markup a hard refresh receives, and it matches
  // what the client would have set, so hydration has nothing to correct.
  const themeDefault = branding?.themeDefault ?? "system";
  const theme = resolveTheme(jar.get(THEME_COOKIE)?.value, themeDefault);

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
        // impersonation bar and the dropdown's "Stop impersonating" row hang
        // off this.
        isImpersonating: Boolean(session?.session.impersonatedBy),
      }
    : null;

  return (
    <html
      lang={language}
      data-theme={theme ?? undefined}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <head>
        <ThemeScript defaultTheme={themeDefault} />
        <BrandingStyle branding={branding} />
      </head>
      <body>
        {/* The catalogue comes from `src/i18n/request.ts`; the provider is what
            carries it into the client components below. */}
        <NextIntlClientProvider>
          <UiText>
            <PublicConfigProvider config={config}>
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
            </PublicConfigProvider>
          </UiText>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
