"use client";

import { Button, FormFooter, Panel, TitleRow } from "@moj/ui";
import Link from "next/link";
import { useActionState } from "react";
import { leaveContest } from "@/app/contest/actions";

export function LeavePanel({
  contestKey,
  contestName,
  spectating,
}: {
  contestKey: string;
  contestName: string;
  spectating: boolean;
}) {
  const [state, formAction, pending] = useActionState(leaveContest, null);

  return (
    <>
      <TitleRow title={spectating ? `Stop spectating ${contestName}` : `Leave ${contestName}`} />
      <div className="mx-auto w-full max-w-[520px]">
        <Panel title="Confirm" bodyClassName="p-4">
          <form action={formAction} className="grid gap-4">
            <input type="hidden" name="key" value={contestKey} />
            <p className="text-base text-subtle">
              {spectating
                ? "You will stop seeing the site through this contest. You can start spectating again at any time."
                : "Leaving takes you out of contest mode. Your window keeps running, so you can rejoin until it closes."}
            </p>
            {state?.error ? <p className="text-sm text-bad">{state.error}</p> : null}
            <FormFooter
              note={
                <Link href={`/contest/${contestKey}/`} className="text-muted-foreground hover:text-subtle">
                  Back to the contest
                </Link>
              }
            >
              <Button type="submit" variant="secondary" busy={pending}>
                {spectating ? "Stop spectating" : "Leave contest"}
              </Button>
            </FormFooter>
          </form>
        </Panel>
      </div>
    </>
  );
}
