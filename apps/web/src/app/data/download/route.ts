import { api } from "@convex/_generated/api";
import { type NextRequest, NextResponse } from "next/server";
import { queryAsViewer } from "@/lib/convex-server";

/**
 * `UserDownloadData`: hand over the archive the `userExport` job built. Convex
 * stores it in file storage, so the route redirects to the signed URL rather
 * than streaming the bytes through Next.
 */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const download = await queryAsViewer(api.pages.users.dataExportDownload, {}).catch(() => null);
  if (!download) return NextResponse.redirect(new URL("/data/prepare/", origin), 302);
  return NextResponse.redirect(download.url, 302);
}
