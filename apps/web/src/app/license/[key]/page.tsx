import { api } from "@convex/_generated/api";
import { Button, ContentDescription, Panel, TitleRow, TwoColumn } from "@moj/ui";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { query, queryAsViewer } from "@/lib/convex-server";
import { renderContent } from "@/lib/markdown";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ key: string }> };

async function load(key: string) {
  return await query(api.site.license, { key: decodeURIComponent(key) }).catch(() => null);
}

export async function generateMetadata({ params }: Props) {
  const license = await load((await params).key);
  return { title: license?.name ?? "Page not found" };
}

/** `LicenseDetail` (judge/views/license.py:6): the text in the content column and
 *  the source link in DMOJ's `info_float`. */
export default async function LicensePage({ params }: Props) {
  const license = await load((await params).key);
  if (!license) notFound();

  const [html, viewerState] = await Promise.all([
    renderContent(license.text, license.textPreset),
    queryAsViewer(api.viewer.current, {}).catch(() => null),
  ]);
  const canEdit = viewerState?.profile?.permissions.includes("judge.change_license");

  return (
    <>
      <TitleRow title={license.name} />
      <div id="content-body">
        <TwoColumn
          side={
            <Panel title="License">
              <div className="grid gap-2">
                <span className="font-mono text-mono text-subtle">{license.key}</span>
                <a
                  href={license.link}
                  rel="nofollow noreferrer"
                  className="flex items-center gap-1.5 text-link"
                >
                  Visit source
                  <ExternalLink className="size-3.5" aria-hidden />
                </a>
                {canEdit ? (
                  <Button asChild variant="secondary" size="sm" className="mt-1 justify-self-start">
                    <Link href={`/admin/licenses/${license._id}/`}>Edit</Link>
                  </Button>
                ) : null}
              </div>
            </Panel>
          }
        >
          <ContentDescription html={html} />
        </TwoColumn>
      </div>
    </>
  );
}
