import { api } from "@convex/_generated/api";
import { ratingClass } from "@moj/ui";
import type { Metadata, Viewport } from "next";
import { ConvexClientProvider } from "@/auth/convex-client";
import { getServerSession } from "@/auth/session";
import { SiteShell } from "@/components/shell/SiteShell";
import { ThemeScript } from "@/components/shell/ThemeScript";
import { query, queryAsViewer } from "@/lib/convex-server";
import { gravatarUrl } from "@/lib/gravatar";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "MOJ", template: "%s - MAPS Online Judge" },
  description:
    "The MAPS Online Judge: problems, contests and rankings for Monash Algorithms and Problem Solving.",
  icons: {
    icon: [
      { url: "/favicon-96x96.png", type: "image/png", sizes: "96x96" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [shell, viewerState, session] = await Promise.all([
    query(api.site.shell, {}).catch(() => null),
    queryAsViewer(api.viewer.current, {}).catch(() => null),
    getServerSession().catch(() => null),
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
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>
        <ConvexClientProvider>
          <SiteShell
            nav={shell?.nav ?? []}
            misc={shell?.misc ?? {}}
            viewer={viewer}
            registrationOpen={shell?.settings?.registrationOpen ?? true}
          >
            {children}
          </SiteShell>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
