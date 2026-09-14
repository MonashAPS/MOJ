"use client";

import { Button, ContentDescription, cn, focusRing, ToggleGroup, ToggleGroupItem, Tooltip } from "@moj/ui";
import { Bold, Code2, Italic, Link2, Sigma } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { renderUserMarkdown } from "./actions";

export type MarkdownEditorProps = {
  value: string;
  onChange: (value: string) => void;
  /** The `@moj/content` preset the body will be rendered with. */
  preset: string;
  id?: string;
  name?: string;
  placeholder?: string;
  ariaLabel?: string;
  maxLength?: number;
  /** Rows the write pane opens at. */
  rows?: number;
  disabled?: boolean;
  /** Why the control is disabled, shown on hover. */
  disabledReason?: string;
  autoFocus?: boolean;
  className?: string;
  /** DMOJ's Martor flow asks for a preview before the post button works. The
   *  parent owns the button, so it is told whether the current text was seen. */
  onPreviewedChange?: (previewed: boolean) => void;
};

/** The placeholder is inserted into the body as markdown source, so it stays in
 *  English with the rest of the sample syntax. */
type Wrap = { before: string; after: string; placeholder: string };

const BOLD: Wrap = { before: "**", after: "**", placeholder: "bold text" };
const ITALIC: Wrap = { before: "*", after: "*", placeholder: "italic text" };
const CODE: Wrap = { before: "`", after: "`", placeholder: "code" };
const MATH: Wrap = { before: "~", after: "~", placeholder: "a^2 + b^2" };
const LINK: Wrap = { before: "[", after: "](https://)", placeholder: "link text" };

/**
 * The markdown control the comment form, the ticket forms, the staff console and
 * the profile "about" box all use: a textarea with a formatting toolbar and a
 * live preview rendered by `renderMarkdown` on the server.
 */
export function MarkdownEditor({
  value,
  onChange,
  preset,
  id,
  name,
  placeholder,
  ariaLabel,
  maxLength,
  rows = 8,
  disabled = false,
  disabledReason,
  autoFocus = false,
  className,
  onPreviewedChange,
}: MarkdownEditorProps) {
  const t = useTranslations("common.markdown");
  const states = useTranslations("common.states");
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<"write" | "preview">("write");
  const [html, setHtml] = useState("");
  const [rendering, setRendering] = useState(false);
  const [previewedSource, setPreviewedSource] = useState<string | null>(null);

  const previewed = previewedSource !== null && previewedSource === value;

  // Held in a ref so an inline callback at the call site cannot re-fire this.
  const notify = useRef(onPreviewedChange);
  notify.current = onPreviewedChange;
  useEffect(() => {
    notify.current?.(previewed);
  }, [previewed]);

  const preview = useCallback(async () => {
    const source = value;
    if (source.trim().length === 0) {
      setHtml("");
      setPreviewedSource(null);
      return;
    }
    setRendering(true);
    try {
      const rendered = await renderUserMarkdown(source, preset);
      setHtml(rendered);
      setPreviewedSource(source);
    } finally {
      setRendering(false);
    }
  }, [preset, value]);

  function applyWrap(wrap: Wrap) {
    const area = areaRef.current;
    if (!area) return;
    const start = area.selectionStart;
    const end = area.selectionEnd;
    const selected = value.slice(start, end);
    const body = selected.length > 0 ? selected : wrap.placeholder;
    const next = `${value.slice(0, start)}${wrap.before}${body}${wrap.after}${value.slice(end)}`;
    if (maxLength !== undefined && next.length > maxLength) return;
    onChange(next);
    setMode("write");
    requestAnimationFrame(() => {
      area.focus();
      const from = start + wrap.before.length;
      area.setSelectionRange(from, from + body.length);
    });
  }

  function onModeChange(next: string) {
    if (next !== "write" && next !== "preview") return;
    setMode(next);
    if (next === "preview" && !previewed) void preview();
  }

  const counter =
    maxLength === undefined ? null : (
      <span
        className={cn(
          "shrink-0 font-mono text-xs tabular-nums",
          value.length > maxLength ? "text-bad" : "text-muted-foreground",
        )}
      >
        {value.length.toLocaleString("en-AU")} / {maxLength.toLocaleString("en-AU")}
      </span>
    );

  return (
    <div
      data-slot="markdown-editor"
      title={disabled ? disabledReason : undefined}
      // The textarea has no border of its own, so the frame carries the one ring.
      className={cn(
        "overflow-hidden rounded-md border border-input bg-card transition-[border-color,box-shadow]",
        "focus-within:border-royal focus-within:ring-[3px] focus-within:ring-royal/45",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-2 py-1.5">
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={onModeChange}
          className="w-auto shrink-0"
          aria-label={t("editorMode")}
        >
          <ToggleGroupItem value="write" className="flex-none px-3" disabled={disabled}>
            {t("write")}
          </ToggleGroupItem>
          <ToggleGroupItem value="preview" className="flex-none px-3">
            {t("preview")}
          </ToggleGroupItem>
        </ToggleGroup>

        <div className="flex shrink-0 items-center gap-0.5">
          <ToolButton label={t("bold")} onClick={() => applyWrap(BOLD)} disabled={disabled}>
            <Bold aria-hidden />
          </ToolButton>
          <ToolButton label={t("italic")} onClick={() => applyWrap(ITALIC)} disabled={disabled}>
            <Italic aria-hidden />
          </ToolButton>
          <ToolButton label={t("code")} onClick={() => applyWrap(CODE)} disabled={disabled}>
            <Code2 aria-hidden />
          </ToolButton>
          <ToolButton label={t("link")} onClick={() => applyWrap(LINK)} disabled={disabled}>
            <Link2 aria-hidden />
          </ToolButton>
          <ToolButton label={t("maths")} onClick={() => applyWrap(MATH)} disabled={disabled}>
            <Sigma aria-hidden />
          </ToolButton>
        </div>

        <span className="ml-auto flex items-center gap-3">
          {rendering ? (
            <span className="shrink-0 text-sm text-muted-foreground">{states("rendering")}</span>
          ) : null}
          {counter}
        </span>
      </div>

      {mode === "write" ? (
        <textarea
          ref={areaRef}
          id={fieldId}
          name={name}
          rows={rows}
          value={value}
          disabled={disabled}
          // biome-ignore lint/a11y/noAutofocus: only set by a reply form the viewer just opened
          autoFocus={autoFocus}
          maxLength={maxLength}
          placeholder={placeholder}
          aria-label={ariaLabel}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            "block w-full resize-y border-0 bg-card px-3 py-2 font-sans text-[16px] leading-(--lh) md:text-base",
            "text-foreground placeholder:text-muted-foreground",
            "outline-none focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
          )}
        />
      ) : (
        <div className="px-3 py-2" style={{ minHeight: `${rows * 20 + 16}px` }}>
          {value.trim().length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("nothingToPreview")}</p>
          ) : html ? (
            <ContentDescription html={html} />
          ) : (
            <p className="text-sm text-muted-foreground">{states("rendering")}</p>
          )}
        </div>
      )}
    </div>
  );
}

function ToolButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip content={label}>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={label}
        onClick={onClick}
        disabled={disabled}
        className={cn("text-subtle", focusRing)}
      >
        {children}
      </Button>
    </Tooltip>
  );
}
