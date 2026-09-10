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
  // `src/app/forbidden.tsx` is only reachable with this on: without it Next's
  // `forbidden()` throws instead of rendering the 403 page.
  experimental: { authInterrupts: true },
};

export default config;
