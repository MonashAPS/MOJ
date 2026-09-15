import type { PublicConfig } from "./public-config";

/** Reads one of the site's public origins out of the environment the process
 *  was started with.
 *
 *  Next replaces every `process.env.NEXT_PUBLIC_*` it can read off the source
 *  with the value the build machine had, in the server bundle as well as the
 *  client one, which would freeze a deployment's hostnames into the published
 *  image. Naming the variable through a parameter leaves the read where it is,
 *  so the standalone server answers from its own environment.
 */
export function publicOrigin(name: string): string | undefined {
  const value = process.env[name];

  return value ? value.replace(/\/+$/, "") : undefined;
}

/** The Convex client API: the websocket a browser subscribes on, and what the
 *  server's own `fetchQuery` calls talk to. */
export function convexUrl(): string {
  return publicOrigin("NEXT_PUBLIC_CONVEX_URL") ?? "http://127.0.0.1:3210";
}

/** The Convex site origin, where the HTTP actions live. */
export function convexSiteUrl(): string {
  return publicOrigin("NEXT_PUBLIC_CONVEX_SITE_URL") ?? "http://127.0.0.1:3211";
}

/** The public origin of the web app itself. */
export function appUrl(): string {
  return publicOrigin("NEXT_PUBLIC_APP_URL") ?? "http://localhost:3000";
}

export function publicConfig(): PublicConfig {
  return { convexUrl: convexUrl(), convexSiteUrl: convexSiteUrl(), appUrl: appUrl() };
}
