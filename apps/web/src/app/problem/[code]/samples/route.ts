import { api } from "@convex/_generated/api";
import { renderMarkdown } from "@moj/content";
import { getTranslations } from "next-intl/server";
import { queryAsViewer } from "@/lib/convex-server";
import { viewerLanguage } from "@/lib/language.server";
import { extractSamples } from "@/lib/statement";
import { zipStored } from "@/lib/zip";

/**
 * `/problem/[code]/samples`: the statement's sample data as a zip, which is
 * what DOMjudge hands a team beside the problem text.
 *
 * The samples are the statement's — DMOJ keeps no sample cases of its own, it
 * writes them into the markdown — so they are read back out of the rendered
 * statement rather than out of the test data, which is secret. The files are
 * named the way a problem package names them, `1.in` beside `1.ans`, so a
 * shell loop over them needs no renaming first.
 */

export const runtime = "nodejs";

export const dynamic = "force-dynamic";

function plain(body: string, status: number): Response {
  return new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
): Promise<Response> {
  const { code } = await params;
  const language = await viewerLanguage();
  const problem = await queryAsViewer(api.problems.get, { code, language }).catch(() => null);

  // A problem the viewer may not read is a problem that is not there, as it is
  // everywhere else: the PDF route answers a private problem the same way.
  if (!problem) return plain((await getTranslations("common.states"))("notFound"), 404);

  const t = await getTranslations("problems.samples");
  const { html } = await renderMarkdown(problem.statement.source, problem.statement.preset);
  const samples = extractSamples(html);

  if (samples.length === 0) return plain(t("none"), 404);

  const zip = zipStored(
    samples.flatMap((sample, index) => [
      { name: `${index + 1}.in`, text: sample.input },
      { name: `${index + 1}.ans`, text: sample.output },
    ]),
  );

  return new Response(zip, {
    status: 200,
    headers: {
      "content-type": "application/zip",
      "content-length": String(zip.byteLength),
      "content-disposition": `attachment; filename="${code}-samples.zip"`,
      "cache-control": "private, max-age=0, must-revalidate",
    },
  });
}
