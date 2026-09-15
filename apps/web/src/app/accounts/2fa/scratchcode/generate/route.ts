import { type NextRequest, NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth/server";
import { authErrorStatus } from "@/lib/auth-error";
import { readJsonBody } from "@/lib/json-body";

type PasswordBody = { password: string };

function isPasswordBody(value: unknown): value is PasswordBody {
  return (
    typeof value === "object" && value !== null && "password" in value && typeof value.password === "string"
  );
}

/** DMOJ's `generate_scratch_codes`: a POST that returns a fresh set and
 *  invalidates the old one. The envelope is DMOJ's `{data: {codes}}`. */
export async function POST(request: NextRequest) {
  const body = await readJsonBody(request, isPasswordBody);
  const password = body?.password;

  try {
    const result = await auth.api.generateBackupCodes({
      headers: request.headers,
      body: password ? { password } : {},
    });

    return NextResponse.json({ data: { codes: result.backupCodes } });
  } catch (error) {
    const status = authErrorStatus(error) ?? 400;
    const t = await getTranslations("auth.twoFactor.scratch");

    return NextResponse.json(
      { error: { message: status === 401 ? t("reauth") : t("rejected") } },
      { status: status === 401 ? 401 : 400 },
    );
  }
}
