"use client";

import { api } from "@convex/_generated/api";
import {
  Button,
  ContentDescription,
  Field,
  FormFooter,
  Input,
  MultiSelect,
  Panel,
  Tabs,
  Textarea,
  toast,
} from "@moj/ui";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, useTransition } from "react";
import { previewOrganizationAbout } from "./actions";

export type AdminOption = { value: string; label: string };

/** `organization/edit.html`, which is DMOJ's `OrganizationForm`: about, logo and
 *  the administrator list. The preview is rendered by the server through the same
 *  `organization-about` preset the page uses. */
export function EditOrganizationForm({
  slug,
  backHref,
  initialAbout,
  initialLogo,
  initialAdmins,
  adminOptions,
}: {
  slug: string;
  backHref: string;
  initialAbout: string;
  initialLogo: string;
  initialAdmins: string[];
  adminOptions: AdminOption[];
}) {
  const router = useRouter();
  const edit = useMutation(api.organizations.edit);
  const aboutId = useId();
  const logoId = useId();
  const adminsId = useId();

  const [about, setAbout] = useState(initialAbout);
  const [logo, setLogo] = useState(initialLogo);
  const [admins, setAdmins] = useState(initialAdmins);
  const [preview, setPreview] = useState("");
  const [tab, setTab] = useState("write");
  const [busy, setBusy] = useState(false);
  const [, startPreview] = useTransition();

  useEffect(() => {
    if (tab !== "preview") return;
    let live = true;
    startPreview(() => {
      previewOrganizationAbout(about).then((html) => {
        if (live) setPreview(html);
      });
    });
    return () => {
      live = false;
    };
  }, [tab, about]);

  async function save() {
    setBusy(true);
    try {
      await edit({ slug, about, logoOverrideImage: logo, adminUsernames: admins });
      toast.success("Organization updated.");
      router.push(backHref);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid max-w-[52rem] gap-4">
      <Panel title="About" bodyClassName="p-3">
        <Tabs
          value={tab}
          onValueChange={setTab}
          panels={[
            {
              key: "write",
              label: "Write",
              content: (
                <Field label="About this organization" htmlFor={aboutId} hint="Markdown, as DMOJ renders it.">
                  <Textarea
                    id={aboutId}
                    value={about}
                    rows={14}
                    onChange={(event) => setAbout(event.target.value)}
                  />
                </Field>
              ),
            },
            {
              key: "preview",
              label: "Preview",
              content: preview ? (
                <ContentDescription html={preview} />
              ) : (
                <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>
              ),
            },
          ]}
        />
      </Panel>

      <Panel title="Details" bodyClassName="grid gap-4 p-3">
        <Field label="Logo image URL" htmlFor={logoId} optional=" (optional)">
          <Input
            id={logoId}
            mono
            value={logo}
            placeholder="https://…"
            onChange={(event) => setLogo(event.target.value)}
          />
        </Field>
        <Field
          label="Administrators"
          htmlFor={adminsId}
          hint="Only members of this organization can administer it."
        >
          <MultiSelect
            id={adminsId}
            options={adminOptions}
            values={admins}
            onChange={setAdmins}
            placeholder="Pick administrators"
          />
        </Field>
      </Panel>

      <FormFooter
        note={admins.length === 0 ? "An organization needs at least one administrator." : undefined}
      >
        <Button variant="secondary" asChild>
          <a href={backHref}>Cancel</a>
        </Button>
        <Button
          busy={busy}
          disabled={admins.length === 0}
          title={admins.length === 0 ? "An organization needs at least one administrator." : undefined}
          onClick={save}
        >
          Update
        </Button>
      </FormFooter>
    </div>
  );
}
