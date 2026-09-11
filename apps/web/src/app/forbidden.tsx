import { ErrorScreen } from "@/components/ErrorScreen";

export const metadata = { title: "Access denied" };

export default function Forbidden() {
  return <ErrorScreen code={403} id="AccessDenied" description="Access denied" />;
}
