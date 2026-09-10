"use client";

import { api } from "@convex/_generated/api";
import { Alert, AlertDescription, AlertTitle } from "@moj/ui";
import { useConsoleQuery } from "./useConsoleQuery";

/**
 * SPEC section 21 keeps operational hints inside `/admin`, and this is one: the
 * console's own read models (`convex/pages/admin1.ts`) ship with this branch but
 * are only live once the deployment has them. Until then some columns, filters
 * and pickers are served by the public queries and say less.
 */
export function ConsoleNotice() {
  const { unavailable } = useConsoleQuery(api.pages.admin1.consoleViewer, {});
  if (!unavailable) return null;
  return (
    <Alert variant="info" className="mb-4">
      <AlertTitle>Some columns are limited</AlertTitle>
      <AlertDescription>
        This deployment does not have the console's own queries yet, so types, authors, judges and the
        revision history fall back to what the public queries can answer. Everything you can edit here still
        saves.
      </AlertDescription>
    </Alert>
  );
}
