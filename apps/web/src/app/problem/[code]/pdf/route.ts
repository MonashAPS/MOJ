import { createHash } from "node:crypto";
import { api } from "@convex/_generated/api";
import { markdownToTypst, renderPdf } from "@moj/content";
import type { NextRequest } from "next/server";
import { mutateAsViewer, queryAsViewer } from "@/lib/convex-server";

/**
 * `/problem/[code]/pdf` (SPEC section 8), DMOJ's `ProblemPdfView`.
 *
 * The statement goes through `markdownToTypst` and then the Typst binary
 * (`TYPST_BIN`, or `typst` on PATH). The result is cached in Convex storage
 * through the `pdfCache` table, keyed by a hash of the statement plus the
 * info-box values, so an edit to either invalidates it.
 */

// Typst is a child process, so this route cannot run on the edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function notFound(): Response {
  return new Response("Page not found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

function pdfHeaders(code: string, length: number): HeadersInit {
  return {
    "content-type": "application/pdf",
    "content-length": String(length),
    "content-disposition": `inline; filename="${code}.pdf"`,
    "cache-control": "private, max-age=0, must-revalidate",
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
): Promise<Response> {
  const { code } = await params;
  const language = request.nextUrl.searchParams.get("language") ?? "en";

  const source = await queryAsViewer(api.problems.pdfSource, { code, language });
  // `problems.pdfSource` returns null for a problem the viewer may not see, so
  // a private problem is indistinguishable from a missing one, as in DMOJ.
  if (!source) return notFound();

  // The template's own text is part of the cache key: a template change has to
  // invalidate every cached PDF.
  const typstSource = markdownToTypst(source.statement, {
    ...source.meta,
    pythonTimeLimit: source.meta.pythonTimeLimit ?? undefined,
  });
  const sourceHash = createHash("sha256").update(typstSource).digest("hex");

  if (source.cached && source.cached.sourceHash === sourceHash && source.cached.url) {
    const cached = await fetch(source.cached.url);
    if (cached.ok) {
      const bytes = new Uint8Array(await cached.arrayBuffer());
      return new Response(bytes, { status: 200, headers: pdfHeaders(code, bytes.byteLength) });
    }
    // The stored blob went away; fall through and render it again.
  }

  let pdf: Buffer;
  try {
    pdf = await renderPdf(typstSource, { bin: process.env.TYPST_BIN });
  } catch (error) {
    console.error(`Failed to render the PDF for ${code}:`, error);
    return new Response("Internal error", {
      status: 500,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  // Cache it for the next reader. A failure here must not fail the download.
  try {
    const uploadUrl = await mutateAsViewer(api.problems.pdfUploadUrl, { code });
    const stored = await fetch(uploadUrl, {
      method: "POST",
      headers: { "content-type": "application/pdf" },
      body: new Uint8Array(pdf),
    });
    if (stored.ok) {
      const { storageId } = (await stored.json()) as { storageId: string };
      await mutateAsViewer(api.problems.savePdf, {
        code,
        language: source.language,
        sourceHash,
        storageId: storageId as never,
      });
    }
  } catch (error) {
    console.error(`Failed to cache the PDF for ${code}:`, error);
  }

  const bytes = new Uint8Array(pdf);
  return new Response(bytes, { status: 200, headers: pdfHeaders(code, bytes.byteLength) });
}
