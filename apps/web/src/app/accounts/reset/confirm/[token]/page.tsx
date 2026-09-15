import { getTranslations } from "next-intl/server";
import { ResetConfirmForm } from "./ResetConfirmForm";

export async function generateMetadata() {
  const t = await getTranslations("auth.resetConfirm");

  return { title: t("metaTitle") };
}

export default async function ResetConfirmPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  return <ResetConfirmForm token={token} />;
}
