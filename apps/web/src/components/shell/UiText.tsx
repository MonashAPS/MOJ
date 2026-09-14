"use client";

import { UiTextProvider } from "@moj/ui";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

/** Fills in the strings `@moj/ui` speaks for itself, which are the screen-reader
 *  labels on chrome that has no call site to take a prop from. The package holds
 *  English; this is where the catalogue reaches it. */
export function UiText({ children }: { children: ReactNode }) {
  const t = useTranslations("common.ui");
  return (
    <UiTextProvider
      value={{
        close: t("close"),
        loading: t("loading"),
      }}
    >
      {children}
    </UiTextProvider>
  );
}
