import type { ProctorGate as GateState } from "@convex/proctor";
import { Alert, AlertDescription, AlertTitle, Button, Panel, TitleRow } from "@moj/ui";
import { MonitorPlay } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { leaveContestForm } from "@/app/contest/actions";

/**
 * What a proctored contest shows instead of the page.
 *
 * Contest mode follows the viewer rather than the URL, so this stands in for
 * every page while it is on — the statements live under `/problem/` like any
 * others, and guarding one route would leave the rest open.
 *
 * A way out is part of the screen on purpose: someone who joined and then
 * decided not to take part would otherwise find every page replaced by this
 * one with nothing to click.
 */
export async function ProctorGate({ state }: { state: GateState }) {
  const t = await getTranslations("contests.supervision");

  return (
    <>
      <TitleRow title={state.contestName ?? t("title")} />
      <Alert variant="warning">
        <MonitorPlay size={16} aria-hidden />
        <AlertTitle>{t("title")}</AlertTitle>
        <AlertDescription>{t("body", { name: state.contestName ?? "" })}</AlertDescription>
      </Alert>

      <div className="mt-6 grid gap-4">
        <Panel title={t("proctorTitle")}>
          <p className="text-sm text-muted-foreground">{t("proctorBody")}</p>
          <p className="mt-3">
            <Button asChild>
              <Link href="/proctor/">
                <MonitorPlay size={16} aria-hidden />
                {t("proctorAction")}
              </Link>
            </Button>
          </p>
        </Panel>

        {state.contestKey ? (
          <form action={leaveContestForm}>
            <input type="hidden" name="key" value={state.contestKey} />
            <Button type="submit" variant="secondary">
              {t("leave")}
            </Button>
          </form>
        ) : null}
      </div>
    </>
  );
}
