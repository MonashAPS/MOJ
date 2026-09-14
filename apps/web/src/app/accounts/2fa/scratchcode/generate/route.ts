import { type NextRequest, NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth/server";

/** DMOJ's `generate_scratch_codes`: a POST that returns a fresh set and
 *  invalidates the old one. The envelope is DMOJ's `{data: {codes}}`. */
export async function POST(request: NextRequest) {
  let password: string | undefined;
  try {
    const body = (await request.json()) as { password?: string };
    password = body.password;
  } catch {
    password = undefined;
  }

  try {
    const result = await auth.api.generateBackupCodes({
      headers: request.headers,
      body: password ? { password } : {},
    });
    return NextResponse.json({ data: { codes: result.backupCodes } });
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode ?? 400;
    const t = await getTranslations("auth.twoFactor.scratch");
    return NextResponse.json(
      { error: { message: status === 401 ? t("reauth") : t("rejected") } },
      { status: status === 401 ? 401 : 400 },
    );
  }
}
