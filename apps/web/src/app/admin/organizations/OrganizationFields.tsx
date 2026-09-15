"use client";

import { Checkbox, Field, FieldGroup, Input } from "@moj/ui";
import { useTranslations } from "next-intl";
import { MarkdownField } from "../_components/MarkdownField";

export type OrganizationDraft = {
  name: string;
  slug: string;
  shortName: string;
  about: string;
  isOpen: boolean;
  classRequired: boolean;
  slots: string;
  accessCode: string;
  logoOverrideImage: string;
  adminUsernames: string;
};

export const EMPTY_ORGANIZATION: OrganizationDraft = {
  name: "",
  slug: "",
  shortName: "",
  about: "",
  isOpen: true,
  classRequired: false,
  slots: "",
  accessCode: "",
  logoOverrideImage: "",
  adminUsernames: "",
};

export function parseUsernames(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/** The fields both the create dialog and the edit page render. */
export function OrganizationFields({
  draft,
  onChange,
  lockSlug = false,
}: {
  draft: OrganizationDraft;
  onChange: (patch: Partial<OrganizationDraft>) => void;
  lockSlug?: boolean;
}) {
  const t = useTranslations("admin.organizations.fields");

  return (
    <>
      <FieldGroup columns={2}>
        <Field label={t("name")} hint={t("nameHint")}>
          <Input value={draft.name} onChange={(event) => onChange({ name: event.target.value })} />
        </Field>
        <Field label={t("shortName")} hint={t("shortNameHint")}>
          <Input
            maxLength={20}
            value={draft.shortName}
            onChange={(event) => onChange({ shortName: event.target.value })}
          />
        </Field>
        <Field label={t("slug")} hint={lockSlug ? t("slugHintLocked") : t("slugHint")}>
          <Input mono value={draft.slug} onChange={(event) => onChange({ slug: event.target.value })} />
        </Field>
        <Field label={t("admins")} hint={t("adminsHint")}>
          <Input
            mono
            value={draft.adminUsernames}
            onChange={(event) => onChange({ adminUsernames: event.target.value })}
            placeholder="glipR, suisei"
          />
        </Field>
        <Field label={t("memberLimit")} optional={t("optional")} hint={t("memberLimitHint")}>
          <Input
            type="number"
            mono
            value={draft.slots}
            onChange={(event) => onChange({ slots: event.target.value })}
          />
        </Field>
        <Field label={t("accessCode")} optional={t("optional")} hint={t("accessCodeHint")}>
          <Input
            mono
            maxLength={7}
            value={draft.accessCode}
            onChange={(event) => onChange({ accessCode: event.target.value })}
          />
        </Field>
      </FieldGroup>

      <MarkdownField
        label={t("about")}
        hint={t("aboutHint")}
        preset="organization-about"
        rows={10}
        value={draft.about}
        onChange={(value) => onChange({ about: value })}
      />

      <FieldGroup columns={2}>
        <Checkbox
          checked={draft.isOpen}
          onCheckedChange={(value) =>
            onChange({ isOpen: value, classRequired: value ? false : draft.classRequired })
          }
          label={t("openEnrollment")}
        />
        <Checkbox
          checked={draft.classRequired}
          disabled={draft.isOpen}
          title={draft.isOpen ? t("classRequiredLocked") : undefined}
          onCheckedChange={(value) => onChange({ classRequired: value })}
          label={t("classRequired")}
        />
      </FieldGroup>

      <Field label={t("logo")} optional={t("optional")} hint={t("logoHint")}>
        <Input
          mono
          value={draft.logoOverrideImage}
          onChange={(event) => onChange({ logoOverrideImage: event.target.value })}
        />
      </Field>
    </>
  );
}
