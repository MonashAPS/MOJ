import { api } from "@convex/_generated/api";
import { ratingClass } from "@moj/ui";
import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { ConvexClientProvider } from "@/auth/convex-client";
import { getServerSession } from "@/auth/session";
import { BrandingStyle } from "@/components/shell/BrandingStyle";
import { SiteShell } from "@/components/shell/SiteShell";
import { SkinProvider } from "@/components/shell/SkinProvider";
import { ThemeScript } from "@/components/shell/ThemeScript";
import { UiText } from "@/components/shell/UiText";
import { CountdownProvider } from "@/lib/CountdownProvider";
import { isInsideContest, PATHNAME_HEADER } from "@/lib/contest-lockdown";
import { query, queryAsViewer } from "@/lib/convex-server";
import { gravatarUrl } from "@/lib/gravatar";
import { viewerLanguage } from "@/lib/language.server";
import { PublicConfigProvider } from "@/lib/public-config";
import { publicConfig } from "@/lib/public-config.server";
import { resolveSkin, SKIN_COOKIE } from "@/lib/skin";
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

  const [shell, viewerState, session, language, branding, jar, joined, requestHeaders] = await Promise.all([
    query(api.site.shell, {}).catch(() => null),
    queryAsViewer(api.viewer.current, {}).catch(() => null),
    getServerSession().catch(() => null),
    viewerLanguage(),
    query(api.site.branding, {}).catch(() => null),
    cookies(),
    queryAsViewer(api.contests.navBar, {}).catch(() => null),
    headers(),
  ]);

  // A locked-down contest is the whole site for as long as someone is competing
  // in it, so a typed URL or a second tab is turned back here, before the page
  // it asked for is rendered at all.
  if (joined?.contest.isLockedDown) {
    const pathname = requestHeaders.get(PATHNAME_HEADER);
    const codes = joined.problems.map((problem) => problem.code);

    if (pathname && !isInsideContest(pathname, joined.contest.key, codes)) {
      redirect(`/contest/${joined.contest.key}/`);
    }
  }

  // Rendering the attribute here rather than leaving it to the inline script
  // means the theme is in the markup a hard refresh receives, and it matches
  // what the client would have set, so hydration has nothing to correct.
  const themeDefault = branding?.themeDefault ?? "system";
  const theme = resolveTheme(jar.get(THEME_COOKIE)?.value, themeDefault);

  const profile = viewerState?.profile ?? null;

  // The skin the same way, except that the fallback is the viewer's own: a
  // choice made on another machine travels with the profile, and the bootstrap
  // is told the same fallback so it does not undo what the markup carries.
  const profileSkin = profile?.siteSkin;
  const skin = resolveSkin(jar.get(SKIN_COOKIE)?.value ?? profileSkin);
  const countdownNow = Date.now();

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
      data-skin={skin}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <head>
        <ThemeScript defaultTheme={themeDefault} defaultSkin={resolveSkin(profileSkin)} />
        <BrandingStyle branding={branding} />
      </head>
      <body>
        {/* The catalogue comes from `src/i18n/request.ts`; the provider is what
            carries it into the client components below. */}
        <NextIntlClientProvider>
          <UiText>
            <PublicConfigProvider config={config}>
              <ConvexClientProvider>
                <CountdownProvider initialNow={countdownNow}>
                  <SkinProvider initial={skin}>
                    <SiteShell
                      nav={shell?.nav ?? []}
                      misc={shell?.misc ?? {}}
                      viewer={viewer}
                      registrationOpen={shell?.settings?.registrationOpen ?? true}
                      language={language}
                      logoUrl={branding?.logoUrl ?? null}
                      siteName={branding?.siteLongName ?? "MAPS Online Judge"}
                      initialContest={joined}
                    >
                      {children}
                    </SiteShell>
                  </SkinProvider>
                </CountdownProvider>
              </ConvexClientProvider>
            </PublicConfigProvider>
          </UiText>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
