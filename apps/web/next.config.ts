import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

/** The problems API is a Convex HTTP action, but operators should not have to
 *  publish a second hostname or teach a CI secret about it. `/api/problems/*`
 *  on the web origin is proxied to the Convex site origin, so `JUDGE_URL` is
 *  just the address of the site. Caddy has the same route in front of a
 *  deployment (infra/Caddyfile) for the case where the web app is not in the
 *  request path. */
const convexSiteUrl = (process.env.NEXT_PUBLIC_CONVEX_SITE_URL ?? "http://127.0.0.1:3211").replace(
  /\/+$/,
  "",
);

const config: NextConfig = {
  reactStrictMode: true,
  // Everything the server needs, traced into `.next/standalone`, is what
  // apps/web/Dockerfile ships. Without it the image would have to carry the
  // whole workspace `node_modules`.
  output: "standalone",
  transpilePackages: ["@moj/ui", "@moj/core"],
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  // `@moj/content` spawns Typst and reads its templates off disk; bundling it
  // drags the whole workspace into the trace and breaks the template lookup.
  serverExternalPackages: ["pg", "@moj/content"],
  // The message catalogues are loaded by a path built at run time, which the
  // tracer cannot follow, so the standalone output would ship without them and
  // every page would fall back to its message keys. Naming them here puts them
  // in the image; `npm run build` alone would not have caught it, since the dev
  // server reads them straight off disk.
  outputFileTracingIncludes: { "/**": ["./messages/**/*.json"] },
  typedRoutes: false,
  agentRules: false,
  trailingSlash: true,
  skipTrailingSlashRedirect: true,
  // A dev server reached on another host than the one it was started on has its
  // HMR handshake refused as cross-origin, and the page never hydrates.
  allowedDevOrigins: ["127.0.0.1"],
  // `src/app/forbidden.tsx` is only reachable with this on: without it Next's
  // `forbidden()` throws instead of rendering the 403 page.
  experimental: { authInterrupts: true },
  async rewrites() {
    return [{ source: "/api/problems/:path*", destination: `${convexSiteUrl}/api/problems/:path*` }];
  },
};

// The plugin points next-intl at `src/i18n/request.ts`, which reads the
// viewer's language cookie and loads their catalogue.
export default createNextIntlPlugin("./src/i18n/request.ts")(config);
