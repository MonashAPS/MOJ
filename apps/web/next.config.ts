import path from "node:path";
import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@moj/ui", "@moj/core"],
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  serverExternalPackages: ["pg"],
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
};

export default config;
