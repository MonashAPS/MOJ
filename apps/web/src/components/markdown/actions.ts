"use server";

import type { Preset } from "@moj/content";
import { renderContent } from "@/lib/markdown";

/** `renderMarkdown` reaches for Shiki's WASM and the Typst binary, so it cannot
 *  run in the browser. The editor's preview asks the server for the same HTML
 *  the page will show. */
export async function renderMarkdownPreview(source: string, preset: string): Promise<string> {
  return renderContent(source, preset as Preset);
}
