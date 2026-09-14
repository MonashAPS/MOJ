"use client";

import { api } from "@convex/_generated/api";
import { Alert, AlertTitle, Button, Field, FormFooter, Input } from "@moj/ui";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

export type CloneSource = {
  code: string;
  name: string;
  description: string;
  summary: string | null;
  points: number;
  partial: boolean;
  timeLimit: number;
  memoryLimit: number;
  shortCircuit: boolean;
  isFullMarkup: boolean;
  group: string | null;
  types: string[];
  licenseKey: string | null;
  allowedLanguages: string[];
};

/**
 * DMOJ's `ProblemClone`: one field for the new code, and the copy lands private
 * with the cloner as its author. Test data is not copied — DMOJ does not copy it
 * either, and MOJ's lives in Convex storage.
 */
export function CloneForm({ source, username }: { source: CloneSource; username: string }) {
  const t = useTranslations("problems.clone");
  const router = useRouter();
  const create = useMutation(api.admin.problems.create);
  const [code, setCode] = useState(`${source.code}-clone`);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="mx-auto grid max-w-md gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const wanted = code.trim();
        if (!/^[a-z0-9_-]+$/i.test(wanted)) {
          setError(t("invalidCode"));
          return;
        }
        setBusy(true);
        setError(null);
        void (async () => {
          try {
            await create({
              code: wanted,
              name: source.name,
              description: source.description,
              summary: source.summary ?? undefined,
              points: source.points,
              partial: source.partial,
              timeLimit: source.timeLimit,
              memoryLimit: source.memoryLimit,
              shortCircuit: source.shortCircuit,
              isFullMarkup: source.isFullMarkup,
              isPublic: false,
              group: source.group ?? undefined,
              types: source.types.length > 0 ? source.types : undefined,
              licenseKey: source.licenseKey ?? undefined,
              allowedLanguages: source.allowedLanguages,
              authors: [username],
              reason: `Cloned from ${source.code}`,
            });
            router.push(`/problem/${wanted}`);
          } catch (thrown) {
            setBusy(false);
            setError(
              thrown instanceof ConvexError && typeof thrown.data === "object" && thrown.data !== null
                ? String((thrown.data as { message?: string }).message ?? t("failed"))
                : t("failed"),
            );
          }
        })();
      }}
    >
      {error ? (
        <Alert variant="danger" role="alert">
          <TriangleAlert size={16} aria-hidden />
          <AlertTitle>{error}</AlertTitle>
        </Alert>
      ) : null}

      <Field label={t("codeLabel")} htmlFor="clone-code" hint={t("codeHint")}>
        <Input id="clone-code" mono required value={code} onChange={(event) => setCode(event.target.value)} />
      </Field>

      <FormFooter>
        <Button type="submit" busy={busy}>
          {t("submit")}
        </Button>
      </FormFooter>
    </form>
  );
}
