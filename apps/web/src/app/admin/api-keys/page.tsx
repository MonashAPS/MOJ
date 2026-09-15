import { TitleRow } from "@moj/ui";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { consoleViewer } from "@/auth/console";
import { ApiKeysPanel } from "./ApiKeysPanel";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.apiKeys");

  return { title: t("metaTitle") };
}

export default async function AdminApiKeysPage() {
  const t = await getTranslations("admin.apiKeys");
  const viewer = await consoleViewer();
  /** The problems API is a Convex HTTP action, but it is published on this
   *  site's own origin (a Next.js rewrite in dev, a Caddy route in front of a
   *  deployment), so `JUDGE_URL` is simply the address of the site. */
  const apiUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");

  return (
    <>
      <TitleRow title={t("title")} />
      <ApiKeysPanel username={viewer?.username ?? ""} apiUrl={apiUrl} />
    </>
  );
}
