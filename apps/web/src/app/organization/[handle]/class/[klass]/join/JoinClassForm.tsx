"use client";

import { api } from "@convex/_generated/api";
import { Button, Field, FormFooter, Input, Panel, toast } from "@moj/ui";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

/** `RequestJoinClass`, with the club's access-code path: a tutor hands the code
 *  out in a lab and the member joins on the spot. */
export function JoinClassForm({
  organizationSlug,
  classSlug,
  name,
  backHref,
  requiresAccessCode,
}: {
  organizationSlug: string;
  classSlug: string;
  name: string;
  backHref: string;
  requiresAccessCode: boolean;
}) {
  const router = useRouter();
  const join = useMutation(api.classes.join);
  const codeId = useId();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await join({ organizationSlug, classSlug, accessCode: code || undefined });
      toast.success(`You are now in ${name}.`);
      router.push(backHref);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid max-w-[36rem] gap-4">
      <Panel title={`Join ${name}`} bodyClassName="grid gap-4 p-4">
        {requiresAccessCode ? (
          <Field label="Access code" htmlFor={codeId} hint="Your tutor hands this out.">
            <Input
              id={codeId}
              mono
              autoComplete="off"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </Field>
        ) : (
          <p className="text-base text-subtle">
            {name} does not take an access code. Ask a tutor to add you, or send the organization a join
            request naming this class.
          </p>
        )}
      </Panel>
      <FormFooter>
        <Button variant="secondary" asChild>
          <a href={backHref}>Cancel</a>
        </Button>
        <Button busy={busy} disabled={!requiresAccessCode || !code} onClick={submit}>
          Join class
        </Button>
      </FormFooter>
    </div>
  );
}
