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
import { useTranslations } from "next-intl";
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
  const t = useTranslations("organizations.membership");
  const shared = useTranslations("organizations.common");
  const actions = useTranslations("common.actions");
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
          {t("logInToJoin")}
        </a>
      </Button>
    );
  }

  async function doJoin(accessCode?: string) {
    setBusy(true);
    try {
      await join({ slug, accessCode });
      toast.success(t("joined", { organization: name }));
      setCodeOpen(false);
      setCode("");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : shared("failed"));
    } finally {
      setBusy(false);
    }
  }

  if (viewer.canLeave) {
    return (
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="secondary" full>
            {t("leave")}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("leaveTitle", { organization: name })}</AlertDialogTitle>
            <AlertDialogDescription>{isOpen ? t("leaveOpen") : t("leavePrivate")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{actions("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={async (event) => {
                event.preventDefault();
                setBusy(true);
                try {
                  await leave({ slug });
                  toast.success(t("left", { organization: name }));
                  router.refresh();
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : shared("failed"));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? t("leaving") : t("leave")}
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
          {t("join")}
        </Button>
      );
    }
    return (
      <Dialog open={codeOpen} onOpenChange={setCodeOpen}>
        <Button full onClick={() => setCodeOpen(true)}>
          {t("join")}
        </Button>
        <DialogContent title={t("joinTitle", { organization: name })} description={t("accessCodeNeeded")}>
          <Field label={t("accessCode")} htmlFor="organization-access-code">
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
              <Button variant="secondary">{actions("cancel")}</Button>
            </DialogClose>
            <Button busy={busy} disabled={!code} onClick={() => doJoin(code)}>
              {t("joinShort")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  if (viewer.hasPendingRequest) {
    return (
      <Button variant="secondary" full disabled title={t("requestPendingTitle")}>
        {t("requestPending")}
      </Button>
    );
  }

  if (viewer.canRequest) {
    return (
      <Button full asChild>
        <a href={requestHref}>{t("requestMembership")}</a>
      </Button>
    );
  }

  return (
    <Button variant="secondary" full disabled title={t("closedTitle", { organization: name })}>
      {t("closed")}
    </Button>
  );
}
