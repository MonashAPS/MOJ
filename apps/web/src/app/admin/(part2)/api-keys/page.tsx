import { TitleRow } from "@moj/ui";
import { consoleViewer } from "../_lib/guard";
import { ApiKeysPanel } from "./ApiKeysPanel";

export const metadata = { title: "API keys" };

export default async function AdminApiKeysPage() {
  const viewer = await consoleViewer();
  /** The problems API is served by Convex's HTTP endpoint, not by the web app,
   *  so that is the base URL a workflow has to be given. */
  const apiUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL ?? "http://127.0.0.1:3211";

  return (
    <>
      <TitleRow title="API keys" />
      <ApiKeysPanel username={viewer?.username ?? ""} apiUrl={apiUrl} />
    </>
  );
}
