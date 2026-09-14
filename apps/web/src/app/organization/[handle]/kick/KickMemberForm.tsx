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
  Combobox,
  Field,
  FormFooter,
  Panel,
  toast,
} from "@moj/ui";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";

/** `KickUserWidgetView`: DMOJ hides this behind a per-row button on the member
 *  table; the same mutation gets its own page so the destructive path is
 *  deliberate and reachable without hovering a row. */
export function KickMemberForm({
  slug,
  name,
  backHref,
  members,
}: {
  slug: string;
  name: string;
  backHref: string;
  members: { value: string; label: string }[];
}) {
  const t = useTranslations("organizations.kick");
  const shared = useTranslations("organizations.common");
  const actions = useTranslations("common.actions");
  const router = useRouter();
  const kick = useMutation(api.organizations.kick);
  const pickerId = useId();
  const [username, setUsername] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  return (
    <div className="grid max-w-[40rem] gap-4">
      <Panel title={t("panel")} bodyClassName="grid gap-4 p-4">
        <Field label={t("member")} htmlFor={pickerId} hint={t("memberHint", { organization: name })}>
          <Combobox
            id={pickerId}
            options={members}
            value={username}
            onValueChange={setUsername}
            searchPlaceholder={t("filter")}
            emptyText={t("noMatch")}
          />
        </Field>
        <p className="text-sm text-muted-foreground">{t("body", { organization: name })}</p>
      </Panel>
      <FormFooter>
        <Button variant="secondary" asChild>
          <a href={backHref}>{actions("cancel")}</a>
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="danger" disabled={!username} title={username ? undefined : t("pickMember")}>
              {t("submit")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("confirmTitle", { username: username ?? "" })}</AlertDialogTitle>
              <AlertDialogDescription>{t("confirmBody", { organization: name })}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{actions("cancel")}</AlertDialogCancel>
              <AlertDialogAction
                disabled={busy}
                onClick={async (event) => {
                  event.preventDefault();
                  if (!username) return;
                  setBusy(true);
                  try {
                    await kick({ slug, username });
                    toast.success(t("kicked", { username }));
                    setUsername(undefined);
                    router.refresh();
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : shared("failed"));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? t("kicking") : t("submit")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </FormFooter>
    </div>
  );
}
