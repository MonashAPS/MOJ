import { loadSourceView } from "@/lib/submissionsData";

export const dynamic = "force-dynamic";

/**
 * `SubmissionSourceRaw` (judge/views/submission.py:202): the source as it was
 * submitted, `text/plain`, with the filename the language would use so a browser
 * that saves it gets something openable.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const view = await loadSourceView(id);
  if (!view) return new Response("Submission not found", { status: 404 });
  if (!view.canSeeSource) return new Response("Access denied", { status: 403 });

  const extension = view.language?.extension || "txt";
  return new Response(view.source, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `inline; filename="submission-${id}.${extension}"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
