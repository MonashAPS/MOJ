"use client";

import { ContentDescription, Field, Skeleton, Textarea, ToggleGroup, ToggleGroupItem } from "@moj/ui";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { previewAction } from "./actions";

type Preset = "flatpage" | "blog" | "self-description" | "license" | "organization-about";

/**
 * The console's markdown field: the source, and the same render the page itself
 * would produce, through `@moj/content`'s sanitiser preset. It is the stand-in
 * for the shared MarkdownEditor part 1 owns — same shape, one file to replace.
 */
export function MarkdownField({
  label,
  hint,
  value,
  onChange,
  preset,
  rows = 16,
  optional,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  preset: Preset;
  rows?: number;
  optional?: string;
}) {
  const t = useTranslations("admin.shell.markdown");
  const [mode, setMode] = useState<"write" | "preview">("write");
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (mode !== "preview") return;
    let cancelled = false;
    setHtml(null);
    startTransition(async () => {
      const result = await previewAction(value, preset);

      if (cancelled) return;

      if (result.ok) {
        setHtml(result.data);
        setError(null);
      } else {
        setHtml("");
        setError(result.error);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [mode, value, preset]);

  return (
    <Field label={label} hint={hint} optional={optional}>
      <div className="grid gap-2">
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(next) => next && setMode(next as "write" | "preview")}
          className="w-auto justify-self-start"
        >
          <ToggleGroupItem value="write">{t("write")}</ToggleGroupItem>
          <ToggleGroupItem value="preview">{t("preview")}</ToggleGroupItem>
        </ToggleGroup>

        {mode === "write" ? (
          <Textarea mono rows={rows} value={value} onChange={(event) => onChange(event.target.value)} />
        ) : error ? (
          <p className="rounded-md border border-border p-3 text-sm text-danger-ink">{error}</p>
        ) : html === null ? (
          <div className="grid gap-2 rounded-md border border-border p-3" aria-busy>
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
          </div>
        ) : html === "" ? (
          <p className="rounded-md border border-border p-3 text-sm text-muted-foreground">
            {t("nothingToPreview")}
          </p>
        ) : (
          <ContentDescription html={html} className="rounded-md border border-border p-3" />
        )}
      </div>
    </Field>
  );
}
