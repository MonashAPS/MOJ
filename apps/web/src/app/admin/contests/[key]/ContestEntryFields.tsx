"use client";

import { Field, FieldGroup, Input, MultiSelect, RadioGroup } from "@moj/ui";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { AdminCheckField, UserPicker } from "@/components/admin";

/**
 * Who can find a contest, and who can get into it.
 *
 * This replaces nine controls that only meant something in combination:
 * `isPrivate` and `isOrganizationPrivate` gating three separate lists, a
 * `limitJoinOrganizations` checkbox with a list of its own, and an access code.
 * Whether a contest was restricted at all could only be worked out by reading
 * all of them, and one of the flags was not even a control — the form set it
 * from whether the organisation list happened to be empty, so clearing the list
 * silently opened the contest up.
 *
 * It is two cards now: open, or restricted. Restricted reveals the three ways to
 * name an audience, which are additive. The join limit is one list rather than a
 * checkbox and a list, because a limit naming nobody admits nobody and there is
 * no reason to be able to say that.
 */
type EntryMode = "open" | "restricted";

function entryModeOf(byName: boolean, byOrganization: boolean): EntryMode {
  return byName || byOrganization ? "restricted" : "open";
}

export interface EntryValues {
  isVisible: boolean;
  isPrivate: boolean;
  isOrganizationPrivate: boolean;
  privateContestants: string[];
  organizationSlugs: string[];
  classNames: string[];
  joinOrganizationSlugs: string[];
  accessCode: string;
}

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

  const mode = entryModeOf(values.isPrivate, values.isOrganizationPrivate);

  /**
   * Switching to open turns the gates off and leaves the lists alone, so the
   * choice is reversible. The lists are inert while the gates are off, because
   * `contestAccessCheck` stops before it reads them.
   */
  function setMode(next: string) {
    if (next === "open") {
      onChange({ isPrivate: false, isOrganizationPrivate: false });

      return;
    }

    // Restricted with nothing named admits nobody, so the gate that has names
    // behind it comes on; a contest naming neither is warned about.
    onChange({
      isPrivate: values.privateContestants.length > 0,
      isOrganizationPrivate: values.organizationSlugs.length > 0 || values.classNames.length > 0,
    });
  }

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

      <RadioGroup
        variant="card"
        name="entry-mode"
        ariaLabel={t("entryMode")}
        value={mode}
        onValueChange={setMode}
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

      {mode === "restricted" ? (
        <FieldGroup columns={2}>
          <Field label={t("entryOrganizations")} htmlFor={ids.organizations}>
            <MultiSelect
              id={ids.organizations}
              values={values.organizationSlugs}
              onChange={(next) =>
                onChange({
                  organizationSlugs: next,
                  isOrganizationPrivate: next.length > 0 || values.classNames.length > 0,
                })
              }
              options={organizationOptions}
              placeholder={t("entryOrganizationsPlaceholder")}
              disabled={!canRestrict}
            />
          </Field>
          <Field label={t("entryClasses")} htmlFor={ids.classes}>
            <MultiSelect
              id={ids.classes}
              values={values.classNames}
              onChange={(next) =>
                onChange({
                  classNames: next,
                  isOrganizationPrivate: next.length > 0 || values.organizationSlugs.length > 0,
                })
              }
              options={classOptions}
              placeholder={t("entryClassesPlaceholder")}
            />
          </Field>
          <Field
            label={t("entryNamed")}
            htmlFor={ids.contestants}
            hint={
              values.isOrganizationPrivate && values.privateContestants.length > 0
                ? t("entryBothGatesHint")
                : undefined
            }
            className="sm:col-span-2"
          >
            <UserPicker
              id={ids.contestants}
              values={values.privateContestants}
              onChange={(next) => onChange({ privateContestants: next, isPrivate: next.length > 0 })}
              disabled={!canRestrict}
              disabledReason={missingPermission("judge.create_private_contest")}
              ariaLabel={t("entryNamed")}
            />
          </Field>
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
