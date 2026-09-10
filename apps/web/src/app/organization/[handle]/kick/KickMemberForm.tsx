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
  const router = useRouter();
  const kick = useMutation(api.organizations.kick);
  const pickerId = useId();
  const [username, setUsername] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  return (
    <div className="grid max-w-[40rem] gap-4">
      <Panel title="Remove a member" bodyClassName="grid gap-4 p-4">
        <Field label="Member" htmlFor={pickerId} hint={`Everyone listed in ${name}.`}>
          <Combobox
            id={pickerId}
            options={members}
            value={username}
            onValueChange={setUsername}
            searchPlaceholder="Filter members…"
            emptyText="No member by that name."
          />
        </Field>
        <p className="text-sm text-muted-foreground">
          Kicking someone removes them from {name} and from every class inside it. They keep their
          submissions and their points.
        </p>
      </Panel>
      <FormFooter>
        <Button variant="secondary" asChild>
          <a href={backHref}>Cancel</a>
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="danger" disabled={!username}>
              Kick member
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Kick {username}?</AlertDialogTitle>
              <AlertDialogDescription>
                They lose their place in {name} and every class inside it, and will have to join again.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={busy}
                onClick={async (event) => {
                  event.preventDefault();
                  if (!username) return;
                  setBusy(true);
                  try {
                    await kick({ slug, username });
                    toast.success(`${username} is no longer a member.`);
                    setUsername(undefined);
                    router.refresh();
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "That did not work.");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "Kicking…" : "Kick member"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </FormFooter>
    </div>
  );
}
