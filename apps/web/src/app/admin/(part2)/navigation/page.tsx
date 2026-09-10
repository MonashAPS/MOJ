import { TitleRow } from "@moj/ui";
import { NavigationEditor } from "./NavigationEditor";

export const metadata = { title: "Navigation" };

export default function AdminNavigationPage() {
  return (
    <>
      <TitleRow title="Navigation" />
      <NavigationEditor />
    </>
  );
}
