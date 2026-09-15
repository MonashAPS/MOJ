"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Button, Select } from "@moj/ui";
import { useQuery } from "convex/react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { type AdminColumn, AdminTable } from "@/components/admin/AdminTable";
import { Flags } from "../_components/console";

type ClassRow = {
  _id: Id<"classes">;
  name: string;
  slug: string;
  isActive: boolean;
  memberCount: number;
  requiresAccessCode: boolean;
};

/** Classes belong to an organisation, so this page picks one and shows its
 *  classes; editing happens on the organisation's own Classes tab. */
export function ClassesBrowser({
  organizations,
}: {
  organizations: Array<{ slug: string; name: string; classCount: number }>;
}) {
  const t = useTranslations("admin.classes");
  const [slug, setSlug] = useState(organizations[0]?.slug ?? "");
  const rows = useQuery(
    api.classes.listForOrganization,
    slug ? { organizationSlug: slug, activeOnly: false } : "skip",
  ) as ClassRow[] | undefined;

  const organization = organizations.find((entry) => entry.slug === slug);

  const columns: AdminColumn<ClassRow>[] = [
    {
      key: "name",
      header: t("columnClass"),
      cell: (row) => (
        <Link
          className="font-medium text-link hover:underline"
          href={`/organization/${slug}/class/${row.slug}/`}
        >
          {row.name}
        </Link>
      ),
    },
    {
      key: "slug",
      header: t("columnSlug"),
      cell: (row) => <span className="font-mono text-mono">{row.slug}</span>,
    },
    { key: "members", header: t("columnMembers"), numeric: true, cell: (row) => row.memberCount },
    {
      key: "state",
      header: t("columnState"),
      cell: (row) => (
        <Flags
          flags={[
            { on: row.isActive, label: t("flagActive"), tone: "good" },
            { on: !row.isActive, label: t("flagArchived"), tone: "warn" },
            { on: row.requiresAccessCode, label: t("flagAccessCode"), tone: "accent" },
          ]}
        />
      ),
    },
  ];

  return (
    <AdminTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row._id}
      toolbar={
        <>
          <Select
            options={organizations.map((entry) => ({
              value: entry.slug,
              label: `${entry.name} (${entry.classCount})`,
            }))}
            value={slug}
            onValueChange={setSlug}
            ariaLabel={t("organizationAria")}
            size="sm"
            className="w-[280px]"
          />
          <Button asChild variant="secondary" size="sm" className="ml-auto">
            <Link href={`/admin/organizations/${slug}/`}>
              {organization ? t("manage", { name: organization.name }) : t("manageFallback")}
            </Link>
          </Button>
        </>
      }
      emptyTitle={t("emptyTitle")}
      emptyDescription={
        organization ? t("emptyDescription", { name: organization.name }) : t("emptyDescriptionFallback")
      }
      emptyAction={
        <Button asChild variant="secondary">
          <Link href={`/admin/organizations/${slug}/`}>{t("addClass")}</Link>
        </Button>
      }
    />
  );
}
