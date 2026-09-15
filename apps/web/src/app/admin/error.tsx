"use client";

import { Button, Panel } from "@moj/ui";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

/**
 * A console section whose subscription fails should say so inside the console,
 * not replace the page with the site's 500. The commonest cause is a permission
 * the viewer does not hold, and the message says as much.
 */
export default function ConsoleSectionError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("admin.shell.sectionError");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Panel title={t("title")} bodyClassName="grid gap-3 p-3">
      <p className="text-base text-subtle">{t("description")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={reset}>
          {t("retry")}
        </Button>
        {error.digest ? (
          <span className="font-mono text-mono text-muted-foreground">
            {t("reference", { digest: error.digest })}
          </span>
        ) : null}
      </div>
    </Panel>
  );
}
