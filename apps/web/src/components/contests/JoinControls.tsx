"use client";

import {
  Button,
  type ButtonSize,
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTrigger,
  Tooltip,
} from "@moj/ui";
import { usePathname } from "next/navigation";
import { useActionState, useState } from "react";
import { joinContest, leaveContest } from "@/app/contest/actions";

export type JoinKind = "join" | "spectate" | "virtual" | "leave" | "stopSpectating" | "blocked" | "login";

const COPY: Record<JoinKind, { short: string; long: string }> = {
  join: { short: "Join", long: "Join contest" },
  spectate: { short: "Spectate", long: "Spectate contest" },
  virtual: { short: "Virtual join", long: "Virtual join" },
  leave: { short: "Leave", long: "Leave contest" },
  stopSpectating: { short: "Stop spectating", long: "Stop spectating" },
  blocked: { short: "Join", long: "Join contest" },
  login: { short: "Log in", long: "Log in to participate" },
};

const CONFIRM: Partial<Record<JoinKind, { title: string; body: string; action: string }>> = {
  join: {
    title: "Join this contest?",
    body: "Joining a contest for the first time starts your timer, after which it becomes unstoppable.",
    action: "Join contest",
  },
  virtual: {
    title: "Join virtually?",
    body: "A virtual participation runs your own window against the contest's problems. It does not appear on the live standings.",
    action: "Virtual join",
  },
};

/**
 * DMOJ's contest join/leave forms: one POST per action, in the places
 * `list.html` and `contest-tabs.html` put them. The confirmation DMOJ raises
 * with `window.confirm` is a dialog here.
 */
export function JoinControl({
  contestKey,
  kind,
  long = false,
  full = false,
  size = "sm",
  banned = false,
  className,
}: {
  contestKey: string;
  kind: JoinKind;
  long?: boolean;
  full?: boolean;
  size?: ButtonSize;
  /** DMOJ's persona non grata: the reason the button is off. */
  banned?: boolean;
  className?: string;
}) {
  const pathname = usePathname() ?? "/contests/";
  const [open, setOpen] = useState(false);
  const leaving = kind === "leave" || kind === "stopSpectating";
  const [state, formAction, pending] = useActionState(leaving ? leaveContest : joinContest, null);
  const label = long ? COPY[kind].long : COPY[kind].short;

  if (kind === "login") {
    return (
      <Button asChild variant="secondary" size={size} full={full} className={className}>
        <a href={`/accounts/login/?next=${encodeURIComponent(pathname)}`}>{label}</a>
      </Button>
    );
  }

  if (kind === "blocked") {
    const why = banned
      ? "You have been declared persona non grata for this contest. You are permanently barred from joining it."
      : "You cannot join this contest.";
    return (
      <Tooltip content={why}>
        <span className={full ? "block w-full" : "inline-block"}>
          <Button variant="secondary" size={size} full={full} disabled title={why} className={className}>
            {label}
          </Button>
        </span>
      </Tooltip>
    );
  }

  const confirm = CONFIRM[kind];
  const button = (
    <Button
      type="submit"
      variant={leaving ? "secondary" : "primary"}
      size={size}
      full={full}
      busy={pending}
      className={className}
    >
      {label}
    </Button>
  );

  const form = (
    <form action={formAction} className={full ? "w-full" : "inline-flex"}>
      <input type="hidden" name="key" value={contestKey} />
      {button}
    </form>
  );

  if (!confirm) {
    return (
      <>
        {form}
        {state?.error ? <p className="mt-1 text-sm text-bad">{state.error}</p> : null}
      </>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="primary" size={size} full={full} className={className}>
            {label}
          </Button>
        </DialogTrigger>
        <DialogContent title={confirm.title} description={confirm.body}>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            <form action={formAction}>
              <input type="hidden" name="key" value={contestKey} />
              <Button type="submit" variant="primary" busy={pending}>
                {confirm.action}
              </Button>
            </form>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {state?.error ? <p className="mt-1 text-sm text-bad">{state.error}</p> : null}
    </>
  );
}
