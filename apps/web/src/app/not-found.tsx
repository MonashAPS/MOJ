import { ErrorScreen } from "@/components/ErrorScreen";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return <ErrorScreen code={404} id="PageNotFound" description="Page not found" />;
}
