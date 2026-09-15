"use client";

import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertTitle,
  Button,
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
  Field,
  Input,
  Panel,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@moj/ui";
import { AlertCircle, Fingerprint, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { PasskeySummary } from "@/auth/account-state";
import { authClient } from "@/auth/client";
import { formatDateTime } from "@/lib/format";
import { readErrorMessage } from "@/lib/json-body";

/** DMOJ's `WebAuthnAttestationView` plus the credential list from its edit
 *  profile page. Registration and deletion both run through Better Auth's
 *  passkey plugin; the delete URL is DMOJ's. */
export function PasskeyManager({
  passkeys,
  lastFactorLocked,
}: {
  passkeys: PasskeySummary[];
  lastFactorLocked: boolean;
}) {
  const t = useTranslations("auth.twoFactor");
  const tError = useTranslations("auth.errors");
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PasskeySummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Whether the browser has WebAuthn is not knowable on the server, so the
  // answer arrives after mount; reading it during render is a hydration
  // mismatch. Assume yes until told otherwise, which is the common case.
  const [supported, setSupported] = useState(true);
  useEffect(() => {
    setSupported(typeof window.PublicKeyCredential !== "undefined");
  }, []);

  async function register(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const result = await authClient.passkey.addPasskey({ name: name.trim() || "Passkey" });

      if (result?.error) {
        setError(t("passkeys.registerFailed"));

        return;
      }

      setName("");
      setNotice(t("passkeys.registered"));
      router.refresh();
    } catch {
      // A cancelled browser prompt is a decision, not a failure.
      setError(null);
    } finally {
      setBusy(false);
    }
  }

  async function remove(passkey: PasskeySummary) {
    setDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/accounts/2fa/webauthn/delete/${passkey.id}/`, { method: "POST" });

      if (!response.ok) {
        setError((await readErrorMessage(response)) ?? t("passkeys.removeFailed"));

        return;
      }

      setPendingDelete(null);
      setNotice(t("passkeys.removed", { name: passkey.name }));
      router.refresh();
    } catch {
      setError(tError("generic"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="grid gap-4">
      {error ? (
        <Alert variant="danger">
          <AlertCircle className="size-3.5" aria-hidden />
          <AlertTitle>{error}</AlertTitle>
        </Alert>
      ) : null}
      {notice ? (
        <Alert variant="success">
          <Fingerprint className="size-3.5" aria-hidden />
          <AlertTitle>{notice}</AlertTitle>
        </Alert>
      ) : null}

      <Panel title={t("passkeys.registerPanel")}>
        <form onSubmit={register} noValidate className="grid gap-4">
          <Field label={t("passkeys.nameLabel")} htmlFor="passkey-name" hint={t("passkeys.nameHint")}>
            <Input
              id="passkey-name"
              name="name"
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("passkeys.namePlaceholder")}
            />
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="submit"
              busy={busy}
              icon={<Fingerprint aria-hidden />}
              disabled={!supported}
              title={supported ? undefined : t("passkeys.unsupported")}
            >
              {busy ? t("passkeys.registerBusy") : t("passkeys.register")}
            </Button>
            {!supported ? (
              <span className="text-sm text-muted-foreground">{t("passkeys.unsupported")}</span>
            ) : null}
          </div>
        </form>
      </Panel>

      <Panel title={t("passkeys.listPanel")} bodyClassName={passkeys.length > 0 ? "p-0" : undefined}>
        {passkeys.length === 0 ? (
          <Empty>
            <EmptyMedia>
              <Fingerprint aria-hidden />
            </EmptyMedia>
            <EmptyTitle>{t("passkeys.emptyTitle")}</EmptyTitle>
            <EmptyDescription>{t("passkeys.emptyDescription")}</EmptyDescription>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("passkeys.columnName")}</TableHead>
                <TableHead>{t("passkeys.columnRegistered")}</TableHead>
                <TableHead className="w-px" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {passkeys.map((passkey) => {
                const locked = lastFactorLocked && passkeys.length === 1;

                return (
                  <TableRow key={passkey.id}>
                    <TableCell className="font-medium text-foreground">{passkey.name}</TableCell>
                    <TableCell className="font-mono text-mono tabular-nums text-subtle">
                      {passkey.createdAt ? formatDateTime(passkey.createdAt) : "—"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("passkeys.remove", { name: passkey.name })}
                        title={
                          locked ? t("passkeys.removeLocked") : t("passkeys.remove", { name: passkey.name })
                        }
                        disabled={locked}
                        onClick={() => setPendingDelete(passkey)}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Panel>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("passkeys.confirmRemoveTitle", { name: pendingDelete?.name ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t("passkeys.confirmRemoveDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("passkeys.keepIt")}</AlertDialogCancel>
            <AlertDialogAction
              aria-busy={deleting || undefined}
              onClick={(event) => {
                event.preventDefault();

                if (pendingDelete) void remove(pendingDelete);
              }}
            >
              {deleting ? t("passkeys.removing") : t("passkeys.confirmRemove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {lastFactorLocked ? (
        <Alert variant="info">
          <AlertCircle className="size-3.5" aria-hidden />
          <AlertTitle>{t("staffRequired")}</AlertTitle>
          <AlertDescription>{t("passkeys.staffRequiredDescription")}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
