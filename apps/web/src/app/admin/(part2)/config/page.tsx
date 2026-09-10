import { api } from "@convex/_generated/api";
import { TitleRow } from "@moj/ui";
import { queryAsViewer } from "@/lib/convex-server";
import { timezoneList } from "@/lib/timezones";
import { ConfigTabs } from "./ConfigTabs";

export const metadata = { title: "Config" };

export default async function AdminConfigPage() {
  const [settings, languages] = await Promise.all([
    queryAsViewer(api.site.settings, {}).catch(() => null),
    queryAsViewer(api.languages.list, {}).catch(() => []),
  ]);

  return (
    <>
      <TitleRow title="Config" />
      <ConfigTabs
        settings={settings}
        languages={languages.map((language) => ({ key: language.key, name: language.name }))}
        timezones={timezoneList()}
      />
    </>
  );
}
