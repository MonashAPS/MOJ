import { getTranslations } from "next-intl/server";
import { ResetRequestForm } from "./ResetRequestForm";

export async function generateMetadata() {
  const t = await getTranslations("auth.passwordReset");
  return { title: t("metaTitle") };
}

export default function PasswordResetPage() {
  return <ResetRequestForm />;
}
