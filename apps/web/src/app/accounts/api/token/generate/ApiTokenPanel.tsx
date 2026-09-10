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
  Badge,
  Button,
  Checkbox,
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
import { AlertCircle, Check, Copy, KeyRound, Terminal, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDateTime } from "@/lib/format";
import { type ApiKeySummary, generateApiToken, type TokenScope } from "./actions";

const SCOPES: Array<{ value: TokenScope; label: string; hint: string }> = [
  { value: "read", label: "read", hint: "Read the API v2 endpoints, limited to what you can already see." },
  {
    value: "problems:write",
    label: "problems:write",
    hint: "Create and update problems through the problems API. What a problem repository's CI needs.",
  },
];

export function ApiTokenPanel({
  tokens,
  legacy,
}: {
  tokens: ApiKeySummary[];
  legacy: { present: boolean; hint: string | null };
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<TokenScope[]>(["read"]);
  const [issued, setIssued] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ApiKeySummary | null>(null);
  const [revokingLegacy, setRevokingLegacy] = useState(false);
  const [working, setWorking] = useState(false);

  function toggle(scope: TokenScope, on: boolean) {
    setScopes((current) => (on ? [...new Set([...current, scope])] : current.filter((s) => s !== scope)));
  }

  async function generate(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await generateApiToken({ name, scopes });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setIssued(result.token);
      setName("");
      router.refresh();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(payload: { keyId?: string; legacy?: boolean }) {
    setWorking(true);
    setError(null);
    try {
      const response = await fetch("/accounts/api/token/remove/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(body?.error?.message ?? "That token could not be revoked.");
        return;
      }
      setPendingDelete(null);
      setRevokingLegacy(false);
      router.refresh();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setWorking(false);
    }
  }

  function copyToken() {
    if (!issued) return;
    void navigator.clipboard.writeText(issued).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  }

  return (
    <div className="grid gap-4">
      {error ? (
        <Alert variant="danger">
          <AlertCircle className="size-3.5" aria-hidden />
          <AlertTitle>{error}</AlertTitle>
        </Alert>
      ) : null}

      {issued ? (
        <Panel title="Your new token" framed>
          <div className="grid gap-3">
            <Alert variant="warning">
              <AlertCircle className="size-3.5" aria-hidden />
              <AlertTitle>Copy it now.</AlertTitle>
              <AlertDescription>
                Only a hash is kept, so this is the one time it is shown. A lost token is replaced, not
                recovered.
              </AlertDescription>
            </Alert>
            <code className="block select-all break-all rounded-xs bg-secondary px-2 py-1.5 font-mono text-mono text-foreground">
              {issued}
            </code>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                icon={copied ? <Check aria-hidden /> : <Copy aria-hidden />}
                onClick={copyToken}
              >
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setIssued(null)}>
                I have saved it
              </Button>
            </div>
          </div>
        </Panel>
      ) : null}

      <Panel title="Generate a token">
        <form onSubmit={generate} noValidate className="grid gap-4">
          <Field
            label="Name"
            htmlFor="token-name"
            hint="What it is for, so you know which one to revoke later."
          >
            <Input
              id="token-name"
              name="name"
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Problem repository CI"
            />
          </Field>

          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-semibold text-subtle">Scopes</legend>
            {SCOPES.map((scope) => (
              <div key={scope.value} className="grid gap-0.5">
                <Checkbox
                  id={`scope-${scope.value}`}
                  label={<span className="font-mono text-mono">{scope.label}</span>}
                  checked={scopes.includes(scope.value)}
                  onCheckedChange={(checked) => toggle(scope.value, checked === true)}
                />
                <span className="pl-6 text-sm text-muted-foreground">{scope.hint}</span>
              </div>
            ))}
          </fieldset>

          <div className="flex justify-end">
            <Button type="submit" busy={busy} icon={<KeyRound aria-hidden />}>
              {busy ? "Generating…" : "Generate token"}
            </Button>
          </div>
        </form>
      </Panel>

      <Panel title="Your tokens" bodyClassName={tokens.length > 0 ? "p-0" : undefined}>
        {tokens.length === 0 ? (
          <Empty>
            <EmptyMedia>
              <Terminal aria-hidden />
            </EmptyMedia>
            <EmptyTitle>No tokens yet</EmptyTitle>
            <EmptyDescription>
              Generate one above to call the API from a script or a problem repository.
            </EmptyDescription>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Scopes</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead className="w-px" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {tokens.map((token) => (
                <TableRow key={token.id}>
                  <TableCell className="font-medium text-foreground">
                    {token.name}
                    {token.start ? (
                      <span className="ml-2 font-mono text-sm text-muted-foreground">{token.start}…</span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <span className="flex flex-wrap gap-1">
                      {token.scopes.length > 0 ? (
                        token.scopes.map((scope) => (
                          <Badge key={scope} variant="outline" mono>
                            {scope}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-mono tabular-nums text-subtle">
                    {formatDateTime(token.createdAt)}
                  </TableCell>
                  <TableCell className="font-mono text-mono tabular-nums text-subtle">
                    {token.lastRequest ? formatDateTime(token.lastRequest) : "—"}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Revoke ${token.name}`}
                      title={`Revoke ${token.name}`}
                      onClick={() => setPendingDelete(token)}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      {legacy.present ? (
        <Panel title="Token from the old site">
          <div className="grid gap-3">
            <p className="text-base text-subtle">
              An API token imported from DMOJ is still valid on this account
              {legacy.hint ? (
                <>
                  {" "}
                  (<code className="font-mono text-mono">{legacy.hint}</code>)
                </>
              ) : null}
              . Revoke it once your scripts use a token from above.
            </p>
            <div className="flex justify-start">
              <Button variant="secondary" onClick={() => setRevokingLegacy(true)}>
                Revoke the old token
              </Button>
            </div>
          </div>
        </Panel>
      ) : null}

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke {pendingDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Anything using it stops working straight away. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              aria-busy={working || undefined}
              onClick={(event) => {
                event.preventDefault();
                if (pendingDelete) void revoke({ keyId: pendingDelete.id });
              }}
            >
              {working ? "Revoking…" : "Revoke"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={revokingLegacy} onOpenChange={setRevokingLegacy}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke the token from the old site?</AlertDialogTitle>
            <AlertDialogDescription>
              Any script still using the DMOJ token stops working straight away.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              aria-busy={working || undefined}
              onClick={(event) => {
                event.preventDefault();
                void revoke({ legacy: true });
              }}
            >
              {working ? "Revoking…" : "Revoke"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
