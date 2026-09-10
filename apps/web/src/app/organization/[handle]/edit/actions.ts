"use server";

import { renderMarkdown } from "@moj/content";
import { getServerSession } from "@/auth/session";

/** The edit form's live preview. `renderMarkdown` loads Shiki and KaTeX, so it
 *  can only run on the server; this is the one door the client has to it. */
export async function previewOrganizationAbout(source: string): Promise<string> {
  const session = await getServerSession();
  if (!session) return "";
  if (!source.trim()) return "";
  const { html } = await renderMarkdown(source.slice(0, 100_000), "organization-about");
  return html;
}
