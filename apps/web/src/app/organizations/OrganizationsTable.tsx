"use client";

import { api } from "@convex/_generated/api";
import { Badge, EmptyRow, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@moj/ui";
import { useQuery } from "convex/react";
import Link from "next/link";
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
  const live = useQuery(api.organizations.list, {});
  const rows = live ?? initial;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Short name</TableHead>
          <TableHead>Membership</TableHead>
          <TableHead numeric>Members</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <EmptyRow colSpan={4}>There are no organizations yet.</EmptyRow>
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
                  {organization.isOpen ? "Open" : "Private"}
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
