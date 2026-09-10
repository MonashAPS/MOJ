import path from "node:path";
import type { NextConfig } from "next";

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
