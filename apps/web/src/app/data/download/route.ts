import { api } from "@convex/_generated/api";
import { NextResponse } from "next/server";
import { queryAsViewer } from "@/lib/convex-server";
import { redirectTo } from "@/lib/redirect";

/**
 * `UserDownloadData`: hand over the archive the `userExport` job built. Convex
 * stores it in file storage, so the route redirects to the signed URL rather
 * than streaming the bytes through Next.
 */
export async function GET() {
  const download = await queryAsViewer(api.pages.users.dataExportDownload, {});

  if (!download) return redirectTo("/data/prepare/");

  return NextResponse.redirect(download.url, 302);
}
