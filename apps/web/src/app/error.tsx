"use client";

import { useTranslations } from "next-intl";
import { ErrorScreen } from "@/components/ErrorScreen";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("common.error");
  return <ErrorScreen code={500} id="InternalError" description={t("internal")} onRetry={reset} />;
}
