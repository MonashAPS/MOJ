import type { SebRequirement } from "@convex/seb";
import { Alert, AlertDescription, AlertTitle, Button, Panel, TitleRow } from "@moj/ui";
import { ShieldAlert } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { leaveContestForm } from "@/app/contest/actions";

/**
 * What a locked contest shows instead of the page.
 *
 * Contest mode is what opens a contest's problems, and it follows the viewer
 * rather than the URL, so this stands in for every page while it is on — the
 * statements live under `/problem/` like any others.
 *
 * A way out is part of the screen on purpose. Someone who joined from a lab
 * machine and then opened the site on their laptop would otherwise find every
 * page replaced by this one with no way back.
 */
export async function SebLaunch({ requirement }: { requirement: SebRequirement }) {
  const t = await getTranslations("contests.seb");
  const { contestKey, contestName, launchUrl, presented } = requirement;

  return (
    <>
      <TitleRow title={contestName ?? t("title")} />
      <Alert variant="warning">
        <ShieldAlert size={16} aria-hidden />
        <AlertTitle>{t("title")}</AlertTitle>
        <AlertDescription>
          {presented ? t("wrongConfiguration") : t("body", { name: contestName ?? "" })}
        </AlertDescription>
      </Alert>

      <div className="mt-6 grid gap-4">
        <Panel title={t("howTo")}>
          <p className="text-sm text-muted-foreground">{launchUrl ? t("launchHint") : t("noLaunchUrl")}</p>
          {launchUrl ? (
            <p className="mt-3">
              <Button asChild>
                <a href={launchUrl}>{t("launch")}</a>
              </Button>
            </p>
          ) : null}
        </Panel>

        {contestKey ? (
          <form action={leaveContestForm}>
            <input type="hidden" name="key" value={contestKey} />
            <Button type="submit" variant="secondary">
              {t("leave")}
            </Button>
          </form>
        ) : null}
      </div>
    </>
  );
}
