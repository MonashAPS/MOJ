import { type NextRequest, NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
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

  const t = await getTranslations("auth.apiToken");

  if (body.legacy) {
    const { api } = await import("@convex/_generated/api");
    const { mutateAsViewer } = await import("@/lib/convex-server");
    try {
      await mutateAsViewer(api.profiles.apiTokens.revokeLegacy, {});
      return NextResponse.json({ status: true });
    } catch {
      return NextResponse.json({ error: { message: t("revokeFailed") } }, { status: 400 });
    }
  }

  if (!body.keyId) {
    return NextResponse.json({ error: { message: t("noTokenNamed") } }, { status: 400 });
  }

  try {
    await auth.api.deleteApiKey({ headers: request.headers, body: { keyId: body.keyId } });
    return NextResponse.json({ status: true });
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode ?? 400;
    return NextResponse.json(
      { error: { message: t("revokeFailed") } },
      { status: status === 401 ? 401 : 400 },
    );
  }
}
