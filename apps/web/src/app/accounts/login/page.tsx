import { getTranslations } from "next-intl/server";
import { LoginForm } from "./LoginForm";

export async function generateMetadata() {
  const t = await getTranslations("auth.login");

  return { title: t("metaTitle") };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;

  return <LoginForm next={params.next ?? "/"} initialError={params.error} />;
}
