import Page from "./content";

export { generateMetadata } from "./content";

export const dynamic = "force-dynamic";

export default function StandalonePage(props: Omit<Parameters<typeof Page>[0], "browsingKey">) {
  return <Page {...props} />;
}
