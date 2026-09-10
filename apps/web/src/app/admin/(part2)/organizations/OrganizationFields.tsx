"use client";

import { Checkbox, Field, FieldGroup, Input } from "@moj/ui";
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
  return (
    <>
      <FieldGroup columns={2}>
        <Field label="Name" hint="The full name members see.">
          <Input value={draft.name} onChange={(event) => onChange({ name: event.target.value })} />
        </Field>
        <Field label="Short name" hint="At most 20 characters, shown beside a username.">
          <Input
            maxLength={20}
            value={draft.shortName}
            onChange={(event) => onChange({ shortName: event.target.value })}
          />
        </Field>
        <Field
          label="Slug"
          hint={
            lockSlug ? "Changing this breaks every existing link." : "Lowercase letters, digits and hyphens."
          }
        >
          <Input mono value={draft.slug} onChange={(event) => onChange({ slug: event.target.value })} />
        </Field>
        <Field label="Administrators" hint="Usernames, comma separated. At least one is required.">
          <Input
            mono
            value={draft.adminUsernames}
            onChange={(event) => onChange({ adminUsernames: event.target.value })}
            placeholder="glipR, suisei"
          />
        </Field>
        <Field label="Member limit" optional=" (optional)" hint="Blank means no limit.">
          <Input
            type="number"
            mono
            value={draft.slots}
            onChange={(event) => onChange({ slots: event.target.value })}
          />
        </Field>
        <Field
          label="Access code"
          optional=" (optional)"
          hint="At most 7 characters; needed to join a closed organisation."
        >
          <Input
            mono
            maxLength={7}
            value={draft.accessCode}
            onChange={(event) => onChange({ accessCode: event.target.value })}
          />
        </Field>
      </FieldGroup>

      <MarkdownField
        label="About"
        hint="Markdown, shown on the organisation's own page."
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
          label="Open enrollment — anyone can join without a request"
        />
        <Checkbox
          checked={draft.classRequired}
          disabled={draft.isOpen}
          title={draft.isOpen ? "Class membership cannot be enforced on an open organisation." : undefined}
          onCheckedChange={(value) => onChange({ classRequired: value })}
          label="Members must belong to a class"
        />
      </FieldGroup>

      <Field
        label="Logo"
        optional=" (optional)"
        hint="A URL that replaces the site wordmark for this organisation's members."
      >
        <Input
          mono
          value={draft.logoOverrideImage}
          onChange={(event) => onChange({ logoOverrideImage: event.target.value })}
        />
      </Field>
    </>
  );
}
