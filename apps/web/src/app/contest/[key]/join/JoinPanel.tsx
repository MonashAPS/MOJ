"use client";

import { Button, Field, FormFooter, Input, Panel, TitleRow } from "@moj/ui";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { joinContest } from "@/app/contest/actions";
import { useHumanDuration } from "@/components/contests/pieces";
import { joinErrorOf } from "@/lib/join-result";

/** `contest/access_code.html`, plus the confirmation DMOJ raises in JavaScript
 *  for a contest that needs no code. */
export function JoinPanel({
  contestKey,
  contestName,
  requiresAccessCode,
  isVirtual,
  alreadyIn,
  timeLimit,
}: {
  contestKey: string;
  contestName: string;
  requiresAccessCode: boolean;
  isVirtual: boolean;
  alreadyIn: boolean;
  /** Seconds. A window contest starts a clock of its own on join. */
  timeLimit: number | null;
}) {
  const [state, formAction, pending] = useActionState(joinContest, null);
  const t = useTranslations("contests.join");
  const humanDuration = useHumanDuration();

  const title = requiresAccessCode
    ? t("accessCodeTitle", { name: contestName })
    : t("joinTitle", { name: contestName });

  return (
    <>
      <TitleRow title={title} />
      <div className="mx-auto w-full max-w-[520px]">
        <Panel title={requiresAccessCode ? t("accessCodePanel") : t("confirmPanel")} bodyClassName="p-4">
          <form action={formAction} className="grid gap-4">
            <input type="hidden" name="key" value={contestKey} />
            {requiresAccessCode ? (
              <Field label={t("accessCodeLabel")} htmlFor="accessCode" error={joinErrorOf(state)}>
                <Input
                  id="accessCode"
                  name="accessCode"
                  mono
                  required
                  autoComplete="off"
                  autoFocus
                  invalid={!!joinErrorOf(state)}
                  className="text-[16px] md:text-base"
                />
              </Field>
            ) : (
              <>
                <p className="text-base text-subtle">
                  {alreadyIn
                    ? t("alreadyIn")
                    : isVirtual
                      ? t("virtualWindow", {
                          duration: timeLimit ? humanDuration(timeLimit * 1000) : t("fullLength"),
                        })
                      : timeLimit
                        ? t("windowStarts", { duration: humanDuration(timeLimit * 1000) })
                        : t("firstTime")}
                </p>
                {joinErrorOf(state) ? <p className="text-sm text-bad">{joinErrorOf(state)}</p> : null}
              </>
            )}
            <FormFooter
              note={
                <Link href={`/contest/${contestKey}/`} className="text-muted-foreground hover:text-subtle">
                  {t("backToContest")}
                </Link>
              }
            >
              <Button type="submit" busy={pending}>
                {requiresAccessCode ? t("join") : isVirtual ? t("virtualJoin") : t("join")}
              </Button>
            </FormFooter>
          </form>
        </Panel>
      </div>
    </>
  );
}
