"use client";

import { PROBLEMS_WRITE_SCOPE, READ_SCOPE } from "@moj/protocol";
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
import { useTranslations } from "next-intl";
import { useState } from "react";
import { formatDateTime } from "@/lib/format";
import { readErrorMessage } from "@/lib/json-body";
import { type ApiKeySummary, generateApiToken, type TokenScope } from "./actions";

export function ApiTokenPanel({
  tokens,
  legacy,
}: {
  tokens: ApiKeySummary[];
  legacy: { present: boolean; hint: string | null };
}) {
  const t = useTranslations("auth.apiToken");
  const tError = useTranslations("auth.errors");
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
      setError(tError("generic"));
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
        setError((await readErrorMessage(response)) ?? t("revokeFailed"));

        return;
      }

      setPendingDelete(null);
      setRevokingLegacy(false);
      router.refresh();
    } catch {
      setError(tError("generic"));
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

  const scopeOptions = [
    { value: READ_SCOPE, label: READ_SCOPE, hint: t("scopeRead") },
    { value: PROBLEMS_WRITE_SCOPE, label: PROBLEMS_WRITE_SCOPE, hint: t("scopeProblemsWrite") },
  ] satisfies { value: TokenScope; label: string; hint: string }[];

  return (
    <div className="grid gap-4">
      {error ? (
        <Alert variant="danger">
          <AlertCircle className="size-3.5" aria-hidden />
          <AlertTitle>{error}</AlertTitle>
        </Alert>
      ) : null}

      {issued ? (
        <Panel title={t("issuedPanel")} framed>
          <div className="grid gap-3">
            <Alert variant="warning">
              <AlertCircle className="size-3.5" aria-hidden />
              <AlertTitle>{t("copyNowTitle")}</AlertTitle>
              <AlertDescription>{t("copyNowDescription")}</AlertDescription>
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
                {copied ? t("copied") : t("copy")}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setIssued(null)}>
                {t("savedIt")}
              </Button>
            </div>
          </div>
        </Panel>
      ) : null}

      <Panel title={t("generatePanel")}>
        <form onSubmit={generate} noValidate className="grid gap-4">
          <Field label={t("nameLabel")} htmlFor="token-name" hint={t("nameHint")}>
            <Input
              id="token-name"
              name="name"
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("namePlaceholder")}
            />
          </Field>

          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-semibold text-subtle">{t("scopesLegend")}</legend>
            {scopeOptions.map((scope) => (
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
              {busy ? t("generateBusy") : t("generate")}
            </Button>
          </div>
        </form>
      </Panel>

      <Panel title={t("listPanel")} bodyClassName={tokens.length > 0 ? "p-0" : undefined}>
        {tokens.length === 0 ? (
          <Empty>
            <EmptyMedia>
              <Terminal aria-hidden />
            </EmptyMedia>
            <EmptyTitle>{t("emptyTitle")}</EmptyTitle>
            <EmptyDescription>{t("emptyDescription")}</EmptyDescription>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columnName")}</TableHead>
                <TableHead>{t("columnScopes")}</TableHead>
                <TableHead>{t("columnCreated")}</TableHead>
                <TableHead>{t("columnLastUsed")}</TableHead>
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
                      aria-label={t("revoke", { name: token.name })}
                      title={t("revoke", { name: token.name })}
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
        <Panel title={t("legacyPanel")}>
          <div className="grid gap-3">
            <p className="text-base text-subtle">
              {legacy.hint
                ? t.rich("legacyDescriptionWithHint", {
                    hint: legacy.hint,
                    code: (chunks) => <code className="font-mono text-mono">{chunks}</code>,
                  })
                : t("legacyDescription")}
            </p>
            <div className="flex justify-start">
              <Button variant="secondary" onClick={() => setRevokingLegacy(true)}>
                {t("revokeLegacy")}
              </Button>
            </div>
          </div>
        </Panel>
      ) : null}

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("confirmRevokeTitle", { name: pendingDelete?.name ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t("confirmRevokeDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("keepIt")}</AlertDialogCancel>
            <AlertDialogAction
              aria-busy={working || undefined}
              onClick={(event) => {
                event.preventDefault();

                if (pendingDelete) void revoke({ keyId: pendingDelete.id });
              }}
            >
              {working ? t("revoking") : t("confirmRevoke")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={revokingLegacy} onOpenChange={setRevokingLegacy}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirmRevokeLegacyTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("confirmRevokeLegacyDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("keepIt")}</AlertDialogCancel>
            <AlertDialogAction
              aria-busy={working || undefined}
              onClick={(event) => {
                event.preventDefault();
                void revoke({ legacy: true });
              }}
            >
              {working ? t("revoking") : t("confirmRevoke")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
