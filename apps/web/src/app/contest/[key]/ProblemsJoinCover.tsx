"use client";

import { Button } from "@moj/ui";
import { useTranslations } from "next-intl";
import { type ReactNode, useState, useTransition } from "react";
import { JoinControl } from "@/components/contests/JoinControls";
import { dismissProblemsJoinCover } from "./actions";

/** A per-contest reminder, remembered on this browser once acknowledged. */
export function ProblemsJoinCover({
  contestKey,
  joinKind,
  initiallyDismissed,
  children,
}: {
  contestKey: string;
  joinKind: "join" | "login" | null;
  initiallyDismissed: boolean;
  children: ReactNode;
}) {
  const t = useTranslations("contests.detail");
  const [dismissed, setDismissed] = useState(false);
  const [, startTransition] = useTransition();

  if (!joinKind || initiallyDismissed || dismissed) return children;

  return (
    <div className="relative isolate grid min-h-48 overflow-hidden rounded-md">
      <div
        inert
        aria-hidden="true"
        className="pointer-events-none col-start-1 row-start-1 select-none blur-sm"
      >
        {children}
      </div>
      <div className="z-10 col-start-1 row-start-1 flex items-start justify-center bg-background/90 p-6">
        <div className="grid max-w-md gap-4 text-center">
          <h2 className="font-semibold">{t("joinBeforeSubmittingTitle")}</h2>
          <p className="text-sm text-foreground">{t("joinBeforeSubmitting")}</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {joinKind === "login" ? (
              <Button asChild variant="primary">
                <a href={`/accounts/login/?next=${encodeURIComponent(`/contest/${contestKey}/`)}`}>
                  {t("loginToJoin")}
                </a>
              </Button>
            ) : (
              <JoinControl contestKey={contestKey} kind="join" long size="default" />
            )}
            <Button
              variant="secondary"
              onClick={() => {
                setDismissed(true);

                startTransition(async () => {
                  try {
                    await dismissProblemsJoinCover(contestKey);
                  } catch {
                    // If persistence fails, keep the list usable for this visit.
                  }
                });
              }}
            >
              {t("viewProblems")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
