import path from "node:path";
import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@moj/ui"],
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  serverExternalPackages: ["pg"],
  typedRoutes: false,
  agentRules: false,
  trailingSlash: true,
  skipTrailingSlashRedirect: true,
  // Every worktree's dev server shares `localhost` for cookies, so a second
  // session on another port signs the first one out. Naming 127.0.0.1 here lets
  // a browser reach the same server on a separate cookie origin; without it the
  // dev client's HMR handshake is refused as cross-origin and the page never
  // hydrates.
  allowedDevOrigins: ["127.0.0.1"],
};

export default config;
