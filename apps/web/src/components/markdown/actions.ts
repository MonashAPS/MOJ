"use server";

import { type Preset, presetConfig } from "@moj/content";
import { renderContent } from "@/lib/markdown";

/** Longer than any body the mutations will accept, so a legitimate draft always
 *  previews and a pasted novel never reaches the renderer. */
const MAX_SOURCE = 65_536;
const MAX_BATCH = 60;

/**
 * `flatpage` and `problem-full` emit their HTML verbatim, so rendering arbitrary
 * text with them would hand anyone a script tag. Everything else is sanitised.
 */
function renderable(preset: string): preset is Preset {
  return presetConfig(preset).sanitise !== "trusted";
}

/** Live preview for the markdown editor, and the renderer for a comment row that
 *  changed after the server rendered the page. */
export async function renderUserMarkdown(source: string, preset: string): Promise<string> {
  if (!renderable(preset)) return "";
  if (source.length > MAX_SOURCE) return "";
  return await renderContent(source, preset);
}

export type MarkdownBatchItem = { key: string; source: string; preset: string };

/** One round trip for every comment row a live update changed. */
export async function renderUserMarkdownBatch(items: MarkdownBatchItem[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const item of items.slice(0, MAX_BATCH)) {
    out[item.key] = await renderUserMarkdown(item.source, item.preset);
  }
  return out;
}
