"use client";

import { api } from "@convex/_generated/api";
import { Badge, Button } from "@moj/ui";
import { useQuery } from "convex/react";
import { ExternalLink, Plus } from "lucide-react";
import Link from "next/link";
import { type AdminColumn, AdminShell, AdminTable } from "@/components/admin";

type Row = {
  _id: string;
  key: string;
  name: string;
  contestKeys: string[];
  theme: string;
  freezeMinutes: number;
  isPublic: boolean;
  badgeOrganizationSlugs: string[];
  inPersonOrganizationSlug?: string;
};

export function ScoreboardsList() {
  const events = useQuery(api.admin.scoreboards.list, {});

  const columns: AdminColumn<Row>[] = [
    {
      key: "key",
      header: "Key",
      cell: (row) => <span className="font-mono text-mono font-medium text-foreground">{row.key}</span>,
    },
    { key: "name", header: "Name", cell: (row) => <span className="truncate">{row.name}</span> },
    {
      key: "contests",
      header: "Contests",
      cell: (row) => (
        <span className="truncate font-mono text-sm text-muted-foreground">
          {row.contestKeys.length > 0 ? row.contestKeys.join(", ") : "—"}
        </span>
      ),
    },
    { key: "theme", header: "Theme", cell: (row) => <span className="capitalize">{row.theme}</span> },
    {
      key: "freeze",
      header: "Freeze",
      numeric: true,
      cell: (row) => (row.freezeMinutes === 0 ? "—" : `${row.freezeMinutes} min`),
    },
    {
      key: "public",
      header: "Access",
      cell: (row) => (
        <Badge variant={row.isPublic ? "good" : "neutral"} shape="square">
          {row.isPublic ? "Public" : "Staff only"}
        </Badge>
      ),
    },
    {
      key: "open",
      header: "",
      cell: (row) => (
        <div className="text-right">
          <Button asChild variant="ghost" size="sm" icon={<ExternalLink aria-hidden />}>
            <Link href={`/scoreboard/${row.key}/`}>Open board</Link>
          </Button>
        </div>
      ),
    },
  ];

  return (
    <AdminShell
      title="Scoreboards"
      description="The hall boards. Each one is always ICPC scored, whatever its contests use."
      breadcrumb={[{ label: "Staff console", href: "/admin/" }, { label: "Scoreboards" }]}
      action={
        <Button asChild size="sm" icon={<Plus aria-hidden />}>
          <Link href="/admin/scoreboards/new/">New scoreboard</Link>
        </Button>
      }
    >
      <AdminTable
        columns={columns}
        rows={(events ?? []) as Row[]}
        rowKey={(row) => row.key}
        href={(row) => `/admin/scoreboards/${row.key}/`}
        loading={events === undefined}
        skeletonRows={4}
        caption="Hall scoreboards"
        empty={{
          title: "No scoreboards yet",
          description:
            "A scoreboard names the contests a hall display shows, and how it is frozen and badged.",
          action: (
            <Button asChild variant="secondary" size="sm">
              <Link href="/admin/scoreboards/new/">New scoreboard</Link>
            </Button>
          ),
        }}
      />
    </AdminShell>
  );
}
