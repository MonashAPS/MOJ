"use client";

import { api } from "@convex/_generated/api";
import { Badge, Button } from "@moj/ui";
import { useQuery } from "convex/react";
import { ExternalLink, Plus } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("admin.scoreboards.list");
  const shell = useTranslations("admin.shell");
  const events = useQuery(api.admin.scoreboards.list, {});

  const columns: AdminColumn<Row>[] = [
    {
      key: "key",
      header: t("columns.key"),
      cell: (row) => <span className="font-mono text-mono font-medium text-foreground">{row.key}</span>,
    },
    {
      key: "name",
      header: t("columns.name"),
      cell: (row) => <span className="truncate">{row.name}</span>,
    },
    {
      key: "contests",
      header: t("columns.contests"),
      cell: (row) => (
        <span className="truncate font-mono text-sm text-muted-foreground">
          {row.contestKeys.length > 0 ? row.contestKeys.join(", ") : "—"}
        </span>
      ),
    },
    {
      key: "theme",
      header: t("columns.theme"),
      cell: (row) => <span className="capitalize">{row.theme}</span>,
    },
    {
      key: "freeze",
      header: t("columns.freeze"),
      numeric: true,
      cell: (row) => (row.freezeMinutes === 0 ? "—" : t("freezeMinutes", { minutes: row.freezeMinutes })),
    },
    {
      key: "public",
      header: t("columns.access"),
      cell: (row) => (
        <Badge variant={row.isPublic ? "good" : "neutral"} shape="square">
          {row.isPublic ? t("public") : t("staffOnly")}
        </Badge>
      ),
    },
    {
      key: "open",
      header: "",
      cell: (row) => (
        <div className="text-right">
          <Button asChild variant="ghost" size="sm" icon={<ExternalLink aria-hidden />}>
            <Link href={`/scoreboard/${row.key}/`}>{t("openBoard")}</Link>
          </Button>
        </div>
      ),
    },
  ];

  return (
    <AdminShell
      title={t("title")}
      description={t("description")}
      breadcrumb={[{ label: shell("consoleName"), href: "/admin/" }, { label: t("title") }]}
      action={
        <Button asChild size="sm" icon={<Plus aria-hidden />}>
          <Link href="/admin/scoreboards/new/">{t("create")}</Link>
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
        caption={t("caption")}
        empty={{
          title: t("emptyTitle"),
          description: t("emptyDescription"),
          action: (
            <Button asChild variant="secondary" size="sm">
              <Link href="/admin/scoreboards/new/">{t("create")}</Link>
            </Button>
          ),
        }}
      />
    </AdminShell>
  );
}
