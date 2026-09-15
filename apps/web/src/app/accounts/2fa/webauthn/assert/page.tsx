import { getTranslations } from "next-intl/server";
import { safeNext } from "@/lib/next-path";
import { AssertClient } from "./AssertClient";

export async function generateMetadata() {
  const t = await getTranslations("auth.twoFactor.passkeys");

  return { title: t("assertMetaTitle") };
}

export default async function AssertPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;

  return <AssertClient next={safeNext(next)} />;
}
