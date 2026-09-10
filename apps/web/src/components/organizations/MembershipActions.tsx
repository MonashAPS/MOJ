"use client";

import { api } from "@convex/_generated/api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  Field,
  Input,
  toast,
} from "@moj/ui";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type MembershipViewer = {
  isMember: boolean;
  canJoin: boolean;
  canLeave: boolean;
  canRequest: boolean;
  hasPendingRequest: boolean;
};

/**
 * `organization/home.html`'s info float: join an open organisation, leave one you
 * are in, or ask to join a private one. The access-code dialog is an addition:
 * `organizations.join` checks the code DMOJ only checks on approval.
 */
export function MembershipActions({
  slug,
  name,
  isOpen,
  requiresAccessCode,
  requestHref,
  viewer,
  signedIn,
}: {
  slug: string;
  name: string;
  isOpen: boolean;
  requiresAccessCode: boolean;
  requestHref: string;
  viewer: MembershipViewer;
  signedIn: boolean;
}) {
  const router = useRouter();
  const join = useMutation(api.organizations.join);
  const leave = useMutation(api.organizations.leave);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [codeOpen, setCodeOpen] = useState(false);

  if (!signedIn) {
    return (
      <Button variant="secondary" full asChild>
        <a href={`/accounts/login/?next=${encodeURIComponent(requestHref.replace(/\/request\/$/, "/"))}`}>
          Log in to join
        </a>
      </Button>
    );
  }

  async function doJoin(accessCode?: string) {
    setBusy(true);
    try {
      await join({ slug, accessCode });
      toast.success(`You are now a member of ${name}.`);
      setCodeOpen(false);
      setCode("");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  }

  if (viewer.canLeave) {
    return (
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="secondary" full>
            Leave organization
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {isOpen
                ? "You will have to rejoin to show up on the organization leaderboard."
                : "You will have to request membership in order to join again."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={async (event) => {
                event.preventDefault();
                setBusy(true);
                try {
                  await leave({ slug });
                  toast.success(`You have left ${name}.`);
                  router.refresh();
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "That did not work.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Leaving…" : "Leave organization"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  if (viewer.canJoin) {
    if (!requiresAccessCode) {
      return (
        <Button full busy={busy} onClick={() => doJoin()}>
          Join organization
        </Button>
      );
    }
    return (
      <Dialog open={codeOpen} onOpenChange={setCodeOpen}>
        <Button full onClick={() => setCodeOpen(true)}>
          Join organization
        </Button>
        <DialogContent title={`Join ${name}`} description="This organization asks for an access code.">
          <Field label="Access code" htmlFor="organization-access-code">
            <Input
              id="organization-access-code"
              mono
              autoComplete="off"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </Field>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            <Button busy={busy} disabled={!code} onClick={() => doJoin(code)}>
              Join
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  if (viewer.hasPendingRequest) {
    return (
      <Button variant="secondary" full disabled title="You already have a request waiting for review.">
        Request pending
      </Button>
    );
  }

  if (viewer.canRequest) {
    return (
      <Button full asChild>
        <a href={requestHref}>Request membership</a>
      </Button>
    );
  }

  return (
    <Button variant="secondary" full disabled title={`${name} is not taking new members.`}>
      Not taking members
    </Button>
  );
}
