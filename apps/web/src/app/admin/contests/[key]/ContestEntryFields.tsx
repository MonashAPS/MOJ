"use client";

import { Field, FieldGroup, Input, MultiSelect, RadioGroup } from "@moj/ui";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { AdminCheckField, UserPicker } from "@/components/admin";
import type { ContestGeneralFields } from "./generalFields";

/**
 * Who can find a contest, and who can get into it.
 *
 * Two cards: open, or restricted. Restricted reveals the three ways to name an
 * audience, and once both an organisation and a person are named, whether a
 * competitor needs to clear both gates or either one. The join limit is one
 * list rather than a checkbox and a list, because a limit naming nobody admits
 * nobody and there is no reason to be able to say that.
 */
export type EntryValues = Pick<
  ContestGeneralFields,
  | "isVisible"
  | "entry"
  | "entryMatch"
  | "organizationSlugs"
  | "classNames"
  | "namedUsers"
  | "joinOrganizationSlugs"
  | "accessCode"
>;

export function ContestEntryFields({
  values,
  organizationOptions,
  classOptions,
  canRestrict,
  canSetAccessCode,
  canChangeVisibility,
  missingPermission,
  onChange,
}: {
  values: EntryValues;
  organizationOptions: { value: string; label: string }[];
  classOptions: { value: string; label: string }[];
  canRestrict: boolean;
  canSetAccessCode: boolean;
  canChangeVisibility: boolean;
  missingPermission: (permission: string) => string;
  onChange: (patch: Partial<EntryValues>) => void;
}) {
  const t = useTranslations("admin.contests.setup");

  const ids = {
    contestants: useId(),
    organizations: useId(),
    classes: useId(),
    join: useId(),
    accessCode: useId(),
  };

  const byOrganization = values.organizationSlugs.length > 0 || values.classNames.length > 0;
  const byName = values.namedUsers.length > 0;

  return (
    <>
      <AdminCheckField
        label={t("visible")}
        hint={t("visibleHint")}
        checked={values.isVisible}
        onCheckedChange={(checked) => onChange({ isVisible: checked })}
        disabled={!canChangeVisibility}
        disabledReason={missingPermission("judge.change_contest_visibility")}
      />

      {/* Switching to open leaves the lists alone, so the choice is reversible;
          they are inert until the contest is restricted again. */}
      <RadioGroup
        variant="card"
        name="entry-mode"
        ariaLabel={t("entryMode")}
        value={values.entry}
        onValueChange={(next) => onChange({ entry: next === "restricted" ? "restricted" : "open" })}
        options={[
          { value: "open", label: t("entryOpen"), description: t("entryOpenHint") },
          {
            value: "restricted",
            label: t("entryRestricted"),
            description: t("entryRestrictedHint"),
            disabled: !canRestrict,
          },
        ]}
      />

      {values.entry === "restricted" ? (
        <FieldGroup columns={2}>
          <Field label={t("entryOrganizations")} htmlFor={ids.organizations}>
            <MultiSelect
              id={ids.organizations}
              values={values.organizationSlugs}
              onChange={(next) => onChange({ organizationSlugs: next })}
              options={organizationOptions}
              placeholder={t("entryOrganizationsPlaceholder")}
            />
          </Field>
          <Field label={t("entryClasses")} htmlFor={ids.classes}>
            <MultiSelect
              id={ids.classes}
              values={values.classNames}
              onChange={(next) => onChange({ classNames: next })}
              options={classOptions}
              placeholder={t("entryClassesPlaceholder")}
            />
          </Field>
          <Field label={t("entryNamed")} htmlFor={ids.contestants} className="sm:col-span-2">
            <UserPicker
              id={ids.contestants}
              values={values.namedUsers}
              onChange={(next) => onChange({ namedUsers: next })}
              ariaLabel={t("entryNamed")}
            />
          </Field>
          {byOrganization && byName ? (
            <RadioGroup
              variant="card"
              name="entry-match"
              ariaLabel={t("entryMatch")}
              value={values.entryMatch}
              onValueChange={(next) => onChange({ entryMatch: next === "any" ? "any" : "all" })}
              options={[
                { value: "all", label: t("entryMatchAll"), description: t("entryMatchAllHint") },
                { value: "any", label: t("entryMatchAny"), description: t("entryMatchAnyHint") },
              ]}
              className="sm:col-span-2"
            />
          ) : null}
        </FieldGroup>
      ) : null}

      <FieldGroup columns={2}>
        <Field label={t("accessCode")} htmlFor={ids.accessCode} hint={t("accessCodeHint")}>
          <Input
            id={ids.accessCode}
            mono
            value={values.accessCode}
            disabled={!canSetAccessCode}
            title={canSetAccessCode ? undefined : missingPermission("judge.contest_access_code")}
            onChange={(event) => onChange({ accessCode: event.target.value })}
          />
        </Field>
        <Field label={t("joinLimit")} htmlFor={ids.join} hint={t("joinLimitHint")}>
          <MultiSelect
            id={ids.join}
            values={values.joinOrganizationSlugs}
            onChange={(next) => onChange({ joinOrganizationSlugs: next })}
            options={organizationOptions}
            placeholder={t("joinLimitPlaceholder")}
          />
        </Field>
      </FieldGroup>
    </>
  );
}
