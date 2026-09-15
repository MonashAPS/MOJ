import { api } from "@convex/_generated/api";
import { Button, ContentDescription, TitleRow } from "@moj/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { query, queryAsViewer } from "@/lib/convex-server";
import { renderContent } from "@/lib/markdown";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ flatpage: string[] }> };

/** Django's `FlatpageFallbackMiddleware` matches the whole path with both slashes,
 *  so `/about/` is the stored url. This route is the fallback the App Router
 *  reaches only when no real page matched, which is the same position. */
function flatPageUrl(segments: string[]): string | null {
  const path = segments.map((segment) => decodeURIComponent(segment)).join("/");

  if (path.length === 0 || path.startsWith("api/") || path.includes("..")) return null;

  return `/${path}/`;
}

async function load(segments: string[]) {
  const url = flatPageUrl(segments);

  if (!url) return null;

  return await query(api.site.flatPage, { url }).catch(() => null);
}

export async function generateMetadata({ params }: Props) {
  const page = await load((await params).flatpage);

  if (!page) return { title: "Page not found" };

  return { title: page.title, openGraph: { title: page.title } };
}

export default async function FlatPage({ params }: Props) {
  const page = await load((await params).flatpage);

  if (!page) notFound();

  const [html, viewerState] = await Promise.all([
    renderContent(page.content, page.contentPreset),
    queryAsViewer(api.viewer.current, {}).catch(() => null),
  ]);

  const canEdit = viewerState?.profile?.isStaff || viewerState?.profile?.isSuperuser;

  return (
    <>
      <TitleRow
        title={page.title}
        action={
          canEdit ? (
            <Button asChild variant="secondary">
              <Link href={`/admin/flatpages/${page._id}/`}>Edit</Link>
            </Button>
          ) : null
        }
      />
      <div id="content-body">
        <ContentDescription html={html} className="max-w-(--prose-max)" />
      </div>
    </>
  );
}
