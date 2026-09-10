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
import { useEffect, useState } from "react";
import type { PasskeySummary } from "@/auth/account-state";
import { authClient } from "@/auth/client";
import { formatDateTime } from "@/lib/format";

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
        setError("That passkey could not be registered. Try again.");
        return;
      }
      setName("");
      setNotice("Your passkey is registered.");
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
        const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(body?.error?.message ?? "That passkey could not be removed.");
        return;
      }
      setPendingDelete(null);
      setNotice(`${passkey.name} has been removed.`);
      router.refresh();
    } catch {
      setError("Something went wrong. Try again.");
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

      <Panel title="Register a passkey">
        <form onSubmit={register} noValidate className="grid gap-4">
          <Field
            label="Name"
            htmlFor="passkey-name"
            hint="Something you will recognise later, like “work laptop” or “YubiKey”."
          >
            <Input
              id="passkey-name"
              name="name"
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Work laptop"
            />
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="submit"
              busy={busy}
              icon={<Fingerprint aria-hidden />}
              disabled={!supported}
              title={supported ? undefined : "This browser does not support passkeys."}
            >
              {busy ? "Waiting for your device…" : "Register a passkey"}
            </Button>
            {!supported ? (
              <span className="text-sm text-muted-foreground">This browser does not support passkeys.</span>
            ) : null}
          </div>
        </form>
      </Panel>

      <Panel title="Your passkeys" bodyClassName={passkeys.length > 0 ? "p-0" : undefined}>
        {passkeys.length === 0 ? (
          <Empty>
            <EmptyMedia>
              <Fingerprint aria-hidden />
            </EmptyMedia>
            <EmptyTitle>No passkeys yet</EmptyTitle>
            <EmptyDescription>
              Register one above and you can sign in with your fingerprint, face or hardware key.
            </EmptyDescription>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Registered</TableHead>
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
                        aria-label={`Remove ${passkey.name}`}
                        title={
                          locked
                            ? "Staff accounts must keep at least one second factor."
                            : `Remove ${passkey.name}`
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
            <AlertDialogTitle>Remove {pendingDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              That device will no longer sign you in. You can register it again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              aria-busy={deleting || undefined}
              onClick={(event) => {
                event.preventDefault();
                if (pendingDelete) void remove(pendingDelete);
              }}
            >
              {deleting ? "Removing…" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {lastFactorLocked ? (
        <Alert variant="info">
          <AlertCircle className="size-3.5" aria-hidden />
          <AlertTitle>Staff accounts must keep two factor authentication enabled.</AlertTitle>
          <AlertDescription>Your last remaining factor cannot be removed.</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
