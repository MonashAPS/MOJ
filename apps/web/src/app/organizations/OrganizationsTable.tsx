"use client";

import { api } from "@convex/_generated/api";
import { Badge, EmptyRow, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@moj/ui";
import { useQuery } from "convex/react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { organizationHref } from "@/lib/organizations";

export type OrganizationRow = {
  _id: string;
  slug: string;
  legacyId?: number;
  name: string;
  shortName: string;
  isOpen: boolean;
  memberCount: number;
  viewerIsMember: boolean;
};

/** `organization/list.html`: name and member count, sortable in DMOJ by
 *  tablesorter. The list is short, so it is drawn whole. */
export function OrganizationsTable({ initial }: { initial: OrganizationRow[] }) {
  const t = useTranslations("organizations.list");
  const live = useQuery(api.organizations.list, {});
  const rows = live ?? initial;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("name")}</TableHead>
          <TableHead>{t("shortName")}</TableHead>
          <TableHead>{t("membership")}</TableHead>
          <TableHead numeric>{t("members")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <EmptyRow colSpan={4}>{t("empty")}</EmptyRow>
        ) : (
          rows.map((organization) => (
            <TableRow key={organization._id} selected={organization.viewerIsMember}>
              <TableCell>
                <Link href={organizationHref(organization)} className="font-medium hover:text-link">
                  {organization.name}
                </Link>
              </TableCell>
              <TableCell className="font-mono text-mono text-subtle">{organization.shortName}</TableCell>
              <TableCell>
                <Badge variant={organization.isOpen ? "good" : "neutral"}>
                  {organization.isOpen ? t("open") : t("private")}
                </Badge>
              </TableCell>
              <TableCell numeric>
                <Link href={organizationHref(organization, "/users/")} className="hover:text-link">
                  {organization.memberCount}
                </Link>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
