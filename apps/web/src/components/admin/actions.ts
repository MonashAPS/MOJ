"use server";

import { requireConsoleViewer } from "@/auth/console";
import { type ActionResult, failed } from "@/lib/actions";
import { renderContent } from "@/lib/markdown";

/**
 * The editor's preview. `@moj/content` runs Shiki and KaTeX in process, so it
 * belongs on the server; the console posts the draft and renders what the page
 * itself would render, through the same sanitiser preset.
 */
export async function previewAction(
  source: string,
  preset: "flatpage" | "blog" | "self-description" | "license" | "organization-about",
): Promise<ActionResult<string>> {
  try {
    await requireConsoleViewer();

    return { ok: true, data: await renderContent(source, preset) };
  } catch (error) {
    return failed(error);
  }
}
