import { type NextRequest, NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth/server";
import { authErrorStatus } from "@/lib/auth-error";
import { readJsonBody } from "@/lib/json-body";

type RemoveTokenBody = { keyId?: string; legacy?: boolean };

function isRemoveTokenBody(value: unknown): value is RemoveTokenBody {
  if (typeof value !== "object" || value === null) return false;

  if ("keyId" in value && typeof value.keyId !== "string") return false;

  return !("legacy" in value) || typeof value.legacy === "boolean";
}

/** DMOJ's `remove_api_token`, POST only. `{"legacy": true}` revokes the token
 *  carried over from the old site instead of an api-key plugin key. */
export async function POST(request: NextRequest) {
  const body = await readJsonBody(request, isRemoveTokenBody);
  const t = await getTranslations("auth.apiToken");

  if (body?.legacy) {
    const { api } = await import("@convex/_generated/api");
    const { mutateAsViewer } = await import("@/lib/convex-server");

    try {
      await mutateAsViewer(api.profiles.apiTokens.revokeLegacy, {});

      return NextResponse.json({ status: true });
    } catch {
      return NextResponse.json({ error: { message: t("revokeFailed") } }, { status: 400 });
    }
  }

  const keyId = body?.keyId;

  if (!keyId) {
    return NextResponse.json({ error: { message: t("noTokenNamed") } }, { status: 400 });
  }

  try {
    await auth.api.deleteApiKey({ headers: request.headers, body: { keyId } });

    return NextResponse.json({ status: true });
  } catch (error) {
    const status = authErrorStatus(error) ?? 400;

    return NextResponse.json(
      { error: { message: t("revokeFailed") } },
      { status: status === 401 ? 401 : 400 },
    );
  }
}
