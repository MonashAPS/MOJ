import { TitleRow } from "@moj/ui";
import { consoleViewer } from "../_lib/guard";
import { ApiKeysPanel } from "./ApiKeysPanel";

export const metadata = { title: "API keys" };

export default async function AdminApiKeysPage() {
  const viewer = await consoleViewer();
  /** The problems API is a Convex HTTP action, but it is published on this
   *  site's own origin (a Next.js rewrite in dev, a Caddy route in front of a
   *  deployment), so `JUDGE_URL` is simply the address of the site. */
  const apiUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");

  return (
    <>
      <TitleRow title="API keys" />
      <ApiKeysPanel username={viewer?.username ?? ""} apiUrl={apiUrl} />
    </>
  );
}
