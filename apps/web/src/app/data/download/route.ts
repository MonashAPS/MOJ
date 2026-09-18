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
  // The query requires a viewer and throws without one, which reached the
  // browser as a 500 on a route anybody can type.
  const download = await queryAsViewer(api.pages.users.dataExportDownload, {}).catch(
    () => "signedOut" as const,
  );

  if (download === "signedOut") return redirectTo("/accounts/login/?next=%2Fdata%2Fprepare%2F");

  if (!download) return redirectTo("/data/prepare/");

  return NextResponse.redirect(download.url, 302);
}
