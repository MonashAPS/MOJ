"use client";

import { Button, Field, FormFooter, Input, Panel, TitleRow } from "@moj/ui";
import Link from "next/link";
import { useActionState } from "react";
import { joinContest } from "@/app/contest/actions";
import { humanDuration } from "@/components/contests/pieces";

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

  const title = requiresAccessCode ? `Enter access code for "${contestName}"` : `Join ${contestName}`;

  return (
    <>
      <TitleRow title={title} />
      <div className="mx-auto w-full max-w-[520px]">
        <Panel title={requiresAccessCode ? "Access code" : "Confirm"} bodyClassName="p-4">
          <form action={formAction} className="grid gap-4">
            <input type="hidden" name="key" value={contestKey} />
            {requiresAccessCode ? (
              <Field label="Access code" htmlFor="accessCode" error={state?.error}>
                <Input
                  id="accessCode"
                  name="accessCode"
                  mono
                  required
                  autoComplete="off"
                  autoFocus
                  invalid={!!state?.error}
                  className="text-[16px] md:text-base"
                />
              </Field>
            ) : (
              <>
                <p className="text-base text-subtle">
                  {alreadyIn
                    ? "You are already in this contest."
                    : isVirtual
                      ? `A virtual participation runs your own ${
                          timeLimit ? humanDuration(timeLimit * 1000) : "full-length"
                        } window against the contest's problems. It does not appear on the live standings.`
                      : timeLimit
                        ? `Joining starts your own ${humanDuration(timeLimit * 1000)} window, after which it becomes unstoppable.`
                        : "Joining a contest for the first time starts your timer, after which it becomes unstoppable."}
                </p>
                {state?.error ? <p className="text-sm text-bad">{state.error}</p> : null}
              </>
            )}
            <FormFooter
              note={
                <Link href={`/contest/${contestKey}/`} className="text-muted-foreground hover:text-subtle">
                  Back to the contest
                </Link>
              }
            >
              <Button type="submit" busy={pending}>
                {requiresAccessCode ? "Join contest" : isVirtual ? "Virtual join" : "Join contest"}
              </Button>
            </FormFooter>
          </form>
        </Panel>
      </div>
    </>
  );
}
