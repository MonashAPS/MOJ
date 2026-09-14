import { getTranslations } from "next-intl/server";
import { safeNext } from "@/lib/next-path";
import { TwoFactorChallenge } from "./TwoFactorChallenge";

export async function generateMetadata() {
  const t = await getTranslations("auth.twoFactor.challenge");
  return { title: t("metaTitle") };
}

export default async function LoginTwoFactorPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; methods?: string }>;
}) {
  const params = await searchParams;
  const methods = (params.methods ?? "totp").split(",");
  return <TwoFactorChallenge next={safeNext(params.next)} hasTotp={methods.includes("totp")} />;
}
