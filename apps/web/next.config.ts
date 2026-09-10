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
};

export default config;
