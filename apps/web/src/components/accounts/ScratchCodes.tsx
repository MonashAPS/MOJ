"use client";

import { Alert, AlertDescription, AlertTitle, Button, Panel } from "@moj/ui";
import { AlertCircle, Check, Copy, Download } from "lucide-react";
import { useState } from "react";

/** DMOJ shows the scratch codes exactly once, with the warning that they will
 *  never be shown again. Copy and download are here so nobody has to retype
 *  them out of a screenshot. */
export function ScratchCodes({
  codes,
  filename = "moj-scratch-codes.txt",
}: {
  codes: string[];
  filename?: string;
}) {
  const [copied, setCopied] = useState(false);
  const text = codes.join("\n");

  function copy() {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  }

  function download() {
    const blob = new Blob([`${text}\n`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="grid gap-4">
      <Alert variant="warning">
        <AlertCircle className="size-3.5" aria-hidden />
        <AlertTitle>Write these down now.</AlertTitle>
        <AlertDescription>
          Each code works once, in place of a code from your app, and they are never shown again. Keep them
          somewhere that is not the phone your authenticator is on.
        </AlertDescription>
      </Alert>

      <Panel title="Scratch codes">
        <ul className="grid gap-1 font-mono text-mono tabular-nums text-foreground sm:grid-cols-2">
          {codes.map((code) => (
            <li key={code} className="select-all rounded-xs bg-secondary px-2 py-1">
              {code}
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            onClick={copy}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button variant="secondary" size="sm" icon={<Download aria-hidden />} onClick={download}>
            Download
          </Button>
        </div>
      </Panel>
    </div>
  );
}
