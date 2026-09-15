"use client";

import {
  Alert,
  AlertTitle,
  Button,
  type ButtonSize,
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTrigger,
  Tooltip,
} from "@moj/ui";
import { TriangleAlert } from "lucide-react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { joinContest, leaveContest } from "@/app/contest/actions";

export type JoinKind = "join" | "spectate" | "virtual" | "leave" | "stopSpectating" | "blocked" | "login";

/** The kinds DMOJ asks about before it posts; the rest go straight through. */
const CONFIRMED: JoinKind[] = ["join", "virtual"];

/**
 * DMOJ's contest join/leave forms: one POST per action, in the places
 * `list.html` and `contest-tabs.html` put them. The confirmation DMOJ raises
 * with `window.confirm` is a dialog here.
 *
 * A proctored contest is not gated here. Joining one is allowed; what it
 * withholds is reading a problem and submitting to one.
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
  const t = useTranslations("contests.joinControls");
  const common = useTranslations("common.actions");
  const label = t(`labels.${kind}.${long ? "long" : "short"}`);

  if (kind === "login") {
    return (
      <Button asChild variant="secondary" size={size} full={full} className={className}>
        <a href={`/accounts/login/?next=${encodeURIComponent(pathname)}`}>{label}</a>
      </Button>
    );
  }

  if (kind === "blocked") {
    const why = banned ? t("banned") : t("blocked");

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

  const confirm = CONFIRMED.includes(kind)
    ? {
        title: t(`confirm.${kind}.title`),
        body: t(`confirm.${kind}.body`),
        action: t(`confirm.${kind}.action`),
      }
    : null;

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
        <JoinError message={state?.error ?? null} />
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
              <Button variant="secondary">{common("cancel")}</Button>
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
      <JoinError message={state?.error ?? null} />
    </>
  );
}

/** A refusal from the server action, which is a sentence and not a field error. */
function JoinError({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <Alert variant="danger" role="alert" className="mt-2">
      <TriangleAlert size={16} aria-hidden />
      <AlertTitle>{message}</AlertTitle>
    </Alert>
  );
}
