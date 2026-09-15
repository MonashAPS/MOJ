import { type Preset, renderMarkdown } from "@moj/content";
import { cache } from "react";

/** Server-only. `renderMarkdown` loads Shiki grammars on demand and renders KaTeX
 *  in process, so it is asynchronous and belongs in a server component. React's
 *  request cache keeps a page from rendering the same body twice. */
export const renderContent = cache(async (source: string, preset: Preset = "default"): Promise<string> => {
  if (!source || source.trim().length === 0) return "";
  const { html } = await renderMarkdown(source, preset);

  return html;
});
