import Page from "./content";

export { generateMetadata } from "./content";

export const dynamic = "force-dynamic";

export default function StandalonePage(props: Parameters<typeof Page>[0]) {
  return <Page {...props} />;
}
