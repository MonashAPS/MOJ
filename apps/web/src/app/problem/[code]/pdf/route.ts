import { createHash } from "node:crypto";
import { api } from "@convex/_generated/api";
import type { NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { mutateAsViewer, queryAsViewer } from "@/lib/convex-server";
import { readStorageId } from "@/lib/convex-upload";
import { normaliseLanguage } from "@/lib/language";
import { viewerLanguage } from "@/lib/language.server";
import { mediaRoot } from "@/lib/media";
import { appUrl } from "@/lib/public-config.server";
import { loadStatementImages, statementImagePath, statementImages } from "@/lib/statement-images";

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

/**
 * Loaded at runtime rather than bundled: `@moj/content` copies its Typst
 * templates out of its own package directory, and a bundler that follows that
 * read traces the entire workspace into this route's output.
 */
async function content(): Promise<typeof import("@moj/content")> {
  return await import(/* turbopackIgnore: true */ "@moj/content");
}

async function notFound(): Promise<Response> {
  const t = await getTranslations("common.states");

  return new Response(t("notFound"), {
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
  // DMOJ's ProblemPdfView takes the language from the URL when the path names
  // one and falls back to request.LANGUAGE_CODE (views/problem.py:304).
  const requested = request.nextUrl.searchParams.get("language");
  const language = requested ? normaliseLanguage(requested) : await viewerLanguage();

  const source = await queryAsViewer(api.problems.pdf.source, { code, language });

  // `problems.pdfSource` returns null for a problem the viewer may not see, so
  // a private problem is indistinguishable from a missing one, as in DMOJ.
  if (!source) return notFound();

  // The template's own text is part of the cache key: a template change has to
  // invalidate every cached PDF.
  const { markdownToTypst, normaliseForCmarker, renderPdf } = await content();

  const meta = { ...source.meta, pythonTimeLimit: source.meta.pythonTimeLimit ?? undefined };

  // Typst has no network and reads only its compile root, so every image the
  // statement draws is gathered up front and named after its source.
  const sources = new Set<string>();
  normaliseForCmarker(source.statement, {
    resolveImage: () => null,
    onImage: ({ original }) => sources.add(original),
  });
  const images = statementImages(sources, { mediaRoot: await mediaRoot(), siteUrl: appUrl() });

  const typstWith = (kept: ReadonlySet<string>) =>
    markdownToTypst(source.statement, meta, {
      resolveImage: (src) => (kept.has(src) ? `/${statementImagePath(src)}` : null),
    });

  const typstSource = typstWith(new Set(images.keys()));

  const sourceHash = createHash("sha256").update(typstSource).digest("hex");

  if (source.cached && source.cached.sourceHash === sourceHash && source.cached.url) {
    const cached = await fetch(source.cached.url);

    if (cached.ok) {
      const bytes = new Uint8Array(await cached.arrayBuffer());

      return new Response(bytes, { status: 200, headers: pdfHeaders(code, bytes.byteLength) });
    }
    // The stored blob went away; fall through and render it again.
  }

  // An image that cannot be read is left out rather than failing the PDF.
  const { assets, missing } = await loadStatementImages(images);

  const rendered =
    missing.size === 0
      ? typstSource
      : typstWith(new Set([...images.keys()].filter((src) => !missing.has(src))));

  let pdf: Buffer;

  try {
    pdf = await renderPdf(rendered, { bin: process.env.TYPST_BIN, assets });
  } catch (error) {
    console.error(`Failed to render the PDF for ${code}:`, error);
    const t = await getTranslations("problems.pdf");

    return new Response(t("internalError"), {
      status: 500,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  // An image that failed may have been a passing failure, so a PDF missing one
  // is not cached and the next reader gets another try.
  if (missing.size === 0) await cachePdf(code, source.language, sourceHash, pdf);

  const bytes = new Uint8Array(pdf);

  return new Response(bytes, { status: 200, headers: pdfHeaders(code, bytes.byteLength) });
}

/** Stores the PDF for the next reader. A failure here must not fail the download. */
async function cachePdf(code: string, language: string, sourceHash: string, pdf: Buffer): Promise<void> {
  try {
    const uploadUrl = await mutateAsViewer(api.problems.pdf.uploadUrl, { code });

    const stored = await fetch(uploadUrl, {
      method: "POST",
      headers: { "content-type": "application/pdf" },
      body: new Uint8Array(pdf),
    });

    const storageId = stored.ok ? await readStorageId(stored) : null;

    if (storageId) await mutateAsViewer(api.problems.pdf.save, { code, language, sourceHash, storageId });
  } catch (error) {
    console.error(`Failed to cache the PDF for ${code}:`, error);
  }
}
