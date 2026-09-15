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
import { useTranslations } from "next-intl";
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
  const t = useTranslations("organizations.edit");
  const shared = useTranslations("organizations.common");
  const actions = useTranslations("common.actions");
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
      toast.success(t("saved"));
      router.push(backHref);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : shared("failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid max-w-[52rem] gap-4">
      <Panel title={t("about")} bodyClassName="p-3">
        <Tabs
          value={tab}
          onValueChange={setTab}
          panels={[
            {
              key: "write",
              label: t("write"),
              content: (
                <Field label={t("aboutLabel")} htmlFor={aboutId} hint={t("aboutHint")}>
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
              label: t("preview"),
              content: preview ? (
                <ContentDescription html={preview} />
              ) : (
                <p className="text-sm text-muted-foreground">{t("previewEmpty")}</p>
              ),
            },
          ]}
        />
      </Panel>

      <Panel title={t("details")} bodyClassName="grid gap-4 p-3">
        <Field label={t("logo")} htmlFor={logoId} optional={t("optional")}>
          <Input
            id={logoId}
            mono
            value={logo}
            placeholder="https://…"
            onChange={(event) => setLogo(event.target.value)}
          />
        </Field>
        <Field label={t("administrators")} htmlFor={adminsId} hint={t("administratorsHint")}>
          <MultiSelect
            id={adminsId}
            options={adminOptions}
            values={admins}
            onChange={setAdmins}
            placeholder={t("administratorsPlaceholder")}
          />
        </Field>
      </Panel>

      <FormFooter note={admins.length === 0 ? t("needAdministrator") : undefined}>
        <Button variant="secondary" asChild>
          <a href={backHref}>{actions("cancel")}</a>
        </Button>
        <Button
          busy={busy}
          disabled={admins.length === 0}
          title={admins.length === 0 ? t("needAdministrator") : undefined}
          onClick={save}
        >
          {t("submit")}
        </Button>
      </FormFooter>
    </div>
  );
}
