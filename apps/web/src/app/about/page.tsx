import { api } from "@convex/_generated/api";
import { renderMarkdown } from "@moj/content";
import { ContentDescription, TitleRow } from "@moj/ui";
import { notFound } from "next/navigation";
import { query } from "@/lib/convex-server";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const page = await query(api.site.flatPage, { url: "/about/" }).catch(() => null);
  return { title: page?.title ?? "About" };
}

export default async function AboutPage() {
  const page = await query(api.site.flatPage, { url: "/about/" }).catch(() => null);
  if (!page) notFound();
  const { html } = await renderMarkdown(page.content, "flatpage");

  return (
    <>
      <TitleRow title={page.title} />
      <div id="content-body">
        <ContentDescription html={html} />
      </div>
    </>
  );
}
