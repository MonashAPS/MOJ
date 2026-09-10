"use client";

import { ContentDescription, Spinner, Tabs, Textarea } from "@moj/ui";
import { Eye, Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { renderMarkdownPreview } from "./actions";

export type MarkdownEditorProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  /** A `@moj/content` preset name; the preview renders with exactly this one. */
  preset?: string;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  invalid?: boolean;
  disabled?: boolean;
  /** Why the editor is off, for the `title` every disabled control carries. */
  disabledReason?: string;
  ariaLabel?: string;
};

/** A write/preview pair over the shared markdown pipeline. The community
 *  branch owns the rich version of this component; this one keeps the same
 *  props so the swap is a deletion. */
export function MarkdownEditor({
  id,
  value,
  onChange,
  preset = "default",
  placeholder,
  rows = 10,
  maxLength,
  invalid = false,
  disabled = false,
  disabledReason,
  ariaLabel,
}: MarkdownEditorProps) {
  const [tab, setTab] = useState("write");
  const [html, setHtml] = useState("");
  const [rendering, setRendering] = useState(false);

  useEffect(() => {
    if (tab !== "preview") return;
    let cancelled = false;
    setRendering(true);
    const timer = window.setTimeout(async () => {
      try {
        const rendered = await renderMarkdownPreview(value, preset);
        if (!cancelled) setHtml(rendered);
      } finally {
        if (!cancelled) setRendering(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [tab, value, preset]);

  return (
    <Tabs
      value={tab}
      onValueChange={setTab}
      panels={[
        {
          key: "write",
          label: "Write",
          icon: <Pencil aria-hidden />,
          content: (
            <Textarea
              id={id}
              value={value}
              onChange={(event) => onChange(event.target.value)}
              placeholder={placeholder}
              rows={rows}
              maxLength={maxLength}
              invalid={invalid}
              disabled={disabled}
              title={disabled ? disabledReason : undefined}
              aria-label={ariaLabel}
              mono
            />
          ),
        },
        {
          key: "preview",
          label: "Preview",
          icon: <Eye aria-hidden />,
          content: rendering ? (
            <p className="flex items-center gap-2 py-6 text-base text-subtle">
              <Spinner aria-hidden />
              Rendering…
            </p>
          ) : html ? (
            <ContentDescription html={html} />
          ) : (
            <p className="py-6 text-base text-muted-foreground">Nothing to preview yet.</p>
          ),
        },
      ]}
    />
  );
}
