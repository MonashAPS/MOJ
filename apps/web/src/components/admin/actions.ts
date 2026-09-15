"use server";

import { getTranslations } from "next-intl/server";
import { requireConsoleViewer } from "@/auth/console";
import { type ActionResult, failed } from "@/lib/actions";
import { renderContent } from "@/lib/markdown";
import { decorateStatement } from "@/lib/statement";

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

/** A statement carries a whole problem — specification, samples, notes and the
 *  markup around its images — so it can run past the 64 KiB the public preview
 *  allows. Four times that: long enough for any statement anyone writes, short
 *  enough that a pasted file never reaches Shiki and KaTeX. */
const MAX_STATEMENT = 262_144;

/**
 * The statement editor's preview. The public preview refuses the trusted presets
 * and never decorates the samples, so a full-markup problem previews as nothing
 * and the Sample Input / Sample Output boxes never appear. This renders the way
 * `/problem/[code]` does — `renderMarkdown`, then `decorateStatement` — which is
 * safe for `problem-full` only because the console viewer gate runs first.
 */
export async function previewStatementAction(
  source: string,
  preset: "problem" | "problem-full",
): Promise<ActionResult<string>> {
  try {
    await requireConsoleViewer();

    if (source.length > MAX_STATEMENT) {
      const t = await getTranslations("admin.statementPreview");

      return { ok: false, error: t("tooLong", { count: MAX_STATEMENT }) };
    }

    return { ok: true, data: decorateStatement(await renderContent(source, preset)) };
  } catch (error) {
    return failed(error);
  }
}
