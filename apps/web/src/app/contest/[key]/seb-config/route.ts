import { api } from "@convex/_generated/api";
import { sebConfigFor, sebConfigPlist } from "@moj/protocol";
import { notFound } from "next/navigation";
import { queryAsViewer } from "@/lib/convex-server";

export const dynamic = "force-dynamic";

/**
 * The Safe Exam Browser configuration for a contest, as a `.seb` file.
 *
 * Rebuilt from the origin it was generated against rather than stored, so the
 * bytes served and the Config Key the contest verifies against cannot drift
 * apart: both are a pure function of the same two values.
 *
 * SEB registers `sebs://`, which is this same address under another scheme, so
 * one link both downloads the file and starts the browser on it.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const config = await queryAsViewer(api.contests.sebConfig, { key }).catch(() => null);
  if (!config) notFound();

  const body = sebConfigPlist(sebConfigFor({ startUrl: config.startUrl, quitUrl: config.quitUrl }));
  return new Response(body, {
    headers: {
      "content-type": "application/seb",
      "content-disposition": `attachment; filename="${key}.seb"`,
      "cache-control": "no-store",
    },
  });
}
