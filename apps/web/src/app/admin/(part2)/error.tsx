"use client";

import { Button, Panel } from "@moj/ui";
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
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Panel title="This section could not be loaded" bodyClassName="grid gap-3 p-3">
      <p className="text-base text-subtle">
        The data behind it did not come back. That usually means your account is missing the permission this
        section needs, or the site lost its connection to the judge database.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={reset}>
          Try again
        </Button>
        {error.digest ? (
          <span className="font-mono text-mono text-muted-foreground">Reference {error.digest}</span>
        ) : null}
      </div>
    </Panel>
  );
}
