import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth/server";

/** DMOJ's `remove_api_token`, POST only. `{"legacy": true}` revokes the token
 *  carried over from the old site instead of an api-key plugin key. */
export async function POST(request: NextRequest) {
  let body: { keyId?: string; legacy?: boolean } = {};
  try {
    body = (await request.json()) as { keyId?: string; legacy?: boolean };
  } catch {
    body = {};
  }

  if (body.legacy) {
    const { api } = await import("@convex/_generated/api");
    const { mutateAsViewer } = await import("@/lib/convex-server");
    try {
      await mutateAsViewer(api.profiles.revokeLegacyApiToken, {});
      return NextResponse.json({ status: true });
    } catch {
      return NextResponse.json({ error: { message: "That token could not be revoked." } }, { status: 400 });
    }
  }

  if (!body.keyId) {
    return NextResponse.json({ error: { message: "No token was named." } }, { status: 400 });
  }

  try {
    await auth.api.deleteApiKey({ headers: request.headers, body: { keyId: body.keyId } });
    return NextResponse.json({ status: true });
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode ?? 400;
    return NextResponse.json(
      { error: { message: "That token could not be revoked." } },
      { status: status === 401 ? 401 : 400 },
    );
  }
}
