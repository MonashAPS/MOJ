import { artefactResponse } from "@/lib/artefactResponse";

export const runtime = "nodejs";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  return await artefactResponse(id);
}
