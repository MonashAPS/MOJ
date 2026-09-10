"use client";

import { ErrorScreen } from "@/components/ErrorScreen";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorScreen code={500} id="InternalError" description="Internal error." onRetry={reset} />;
}
