"use client";

import { createContext, type ReactNode, useContext } from "react";

/** The origins the browser has to know about.
 *
 *  They reach it from the server on every request, never from the bundle: one
 *  published image serves any host, so the hostnames are not known when
 *  `next build` runs. `app/layout.tsx` reads them and renders the provider
 *  below; browser code asks `usePublicConfig()`.
 */
export type PublicConfig = {
  convexUrl: string;
  convexSiteUrl: string;
  appUrl: string;
};

const PublicConfigContext = createContext<PublicConfig | null>(null);

export function PublicConfigProvider({ config, children }: { config: PublicConfig; children: ReactNode }) {
  return <PublicConfigContext.Provider value={config}>{children}</PublicConfigContext.Provider>;
}

export function usePublicConfig(): PublicConfig {
  const config = useContext(PublicConfigContext);

  if (!config) throw new Error("usePublicConfig needs a PublicConfigProvider above it");

  return config;
}
