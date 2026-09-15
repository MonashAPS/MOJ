import { type NextRequest, NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth/server";
import { authErrorMessage, authErrorStatus } from "@/lib/auth-error";

/** DMOJ's `webauthn_delete`, POST only. The staff last-factor rule lives in the
 *  Better Auth before hook, so it holds however this endpoint is reached. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ pk: string }> }) {
  const { pk } = await params;

  try {
    await auth.api.deletePasskey({ headers: request.headers, body: { id: pk } });

    return NextResponse.json({ status: true });
  } catch (error) {
    const status = authErrorStatus(error) ?? 400;
    const message = authErrorMessage(error);
    const t = await getTranslations("auth.twoFactor.passkeys");

    return NextResponse.json(
      { error: { message: message ?? t("removeFailed") } },
      { status: status === 401 || status === 404 ? status : 400 },
    );
  }
}
