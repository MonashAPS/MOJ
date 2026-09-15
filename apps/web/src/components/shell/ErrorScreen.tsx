"use client";

import { Button, Panel } from "@moj/ui";
import { FileQuestion, ShieldAlert, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

function SignalIcon({ code }: { code: number }) {
  if (code === 403) return <ShieldAlert size={14} strokeWidth={2} aria-hidden />;

  if (code === 404) return <FileQuestion size={14} strokeWidth={2} aria-hidden />;

  return <TriangleAlert size={14} strokeWidth={2} aria-hidden />;
}

/** DMOJ's joke, rebuilt on the design system: the fake segfault now lives inside the
 *  club's window motif — a framed panel with a `SIGSEGV` titlebar over a `--code-bg`
 *  body — centred on the page ground with the royal grid. No stack traces, and the
 *  way out is a real button rather than a link inside a `<pre>`. */
export function ErrorScreen({
  code,
  id,
  description,
  onRetry,
}: {
  code: number;
  id: string;
  description: string;
  onRetry?: () => void;
}) {
  const t = useTranslations("common.error");
  const actions = useTranslations("common.actions");

  return (
    <div className="relative flex min-h-[60dvh] items-center justify-center py-12">
      <Panel
        framed
        title="SIGSEGV"
        action={<span className="font-mono text-xs text-muted-foreground">{id}</span>}
        icon={<SignalIcon code={code} />}
        className="w-full max-w-[520px]"
        bodyClassName="grid gap-5 bg-code p-6"
      >
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="font-mono text-[44px] font-bold leading-none tracking-tight tabular-nums text-foreground">
            {code}
          </span>
          <h1>{description}</h1>
        </div>

        <div className="grid gap-1 font-mono text-mono text-muted-foreground">
          <span>{t("signal")}</span>
          <span>
            {t.rich("exit", {
              code,
              num: (chunks) => <span className="tabular-nums">{chunks}</span>,
            })}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="secondary">
            <Link href="/">{actions("goHome")}</Link>
          </Button>
          {onRetry ? (
            <Button variant="primary" onClick={onRetry}>
              {actions("tryAgain")}
            </Button>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}
